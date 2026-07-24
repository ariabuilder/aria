import { ref } from "vue";
import { AGENT_WS_PATH_PREFIX } from "../../lib/constants";
import type { ClientToolSchema } from "../../lib/clientToolSchemas";
import {
  agentWsCloseReasonMessage,
  parseAgentWsCloseCode,
} from "../../lib/wsCloseReason";
import type {
  AgentChatMessage,
  AgentChatRequestExtras,
  AgentToolStep,
} from "../../lib/schemas";
import {
  AgentWsChatResponseFrameSchema,
  AgentWsTurnStatusFrameSchema,
  buildAgentChatRequestBody,
  buildAgentToolResultPayload,
  type AgentStreamEvent,
  type AgentWsTurnStatusPhase,
  wsFrameToStreamEvent,
} from "../../lib/wsChatProtocol";
import {
  createStreamConsumerState,
  consumeStreamEvent,
  type StreamConsumerState,
} from "../../lib/streamEventConsumer";

export interface AgentWsStreamChatResult {
  content: string;
  toolSteps: AgentToolStep[];
  pendingClientTools: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
  }>;
  consumerState: StreamConsumerState;
}

export interface AgentWsPendingClientTool {
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface AgentWsToolResultInput {
  toolCallId: string;
  toolName: string;
  output: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
  autoContinue?: boolean;
  clientToolSchemas?: ClientToolSchema[];
}

const CONTINUATION_HANDSHAKE_TIMEOUT_MS = 5000;
const SOCKET_OPEN_TIMEOUT_MS = 10000;
export const AGENT_WS_ACCEPT_TIMEOUT_MS = 15_000;
export const AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS = 130_000;

function createRequestId(): string {
  return crypto.randomUUID().replace(/-/gu, "").slice(0, 8);
}

function buildAgentWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${AGENT_WS_PATH_PREFIX}`;
}

type ActiveStream = {
  requestId: string;
  consumerState: StreamConsumerState;
  onDelta: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onToolSteps?: (steps: AgentToolStep[]) => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onTurnStatus?: (phase: AgentWsTurnStatusPhase) => void;
  onClientToolCall?: (tool: AgentWsPendingClientTool) => Promise<void>;
  toolNameByCallId: Map<string, string>;
  dispatchedClientToolCallIds: Set<string>;
  pendingClientToolTasks: Set<Promise<void>>;
  finishRequested: boolean;
  resolve: (result: AgentWsStreamChatResult) => void;
  reject: (error: Error) => void;
  finish: (action: () => void) => void;
  markAccepted: (phase?: AgentWsTurnStatusPhase) => void;
  markModelEventReceived: () => void;
};

let socket: WebSocket | null = null;
let socketListenerAttached = false;
const isConnected = ref(false);
const connectionError = ref<string | null>(null);
let activeStream: ActiveStream | null = null;
let continuationHandshake: {
  resolve: (requestId: string) => void;
  reject: (error: Error) => void;
} | null = null;
let expectsToolContinuation = false;
let bufferedToolContinuationRequestId: string | null = null;

function attachSocketListeners(ws: WebSocket): void {
  if (socketListenerAttached && socket === ws) {
    return;
  }

  ws.addEventListener("open", () => {
    isConnected.value = true;
    connectionError.value = null;
  });

  ws.addEventListener("close", (event) => {
    isConnected.value = false;
    expectsToolContinuation = false;
    bufferedToolContinuationRequestId = null;
    if (socket === ws) {
      socket = null;
      socketListenerAttached = false;
    }

    const closeReason = parseAgentWsCloseCode(event.code);
    if (closeReason) {
      connectionError.value = agentWsCloseReasonMessage(closeReason);
    } else if (event.code !== 1000 && event.code !== 1001) {
      connectionError.value = "Agent connection closed";
    }

    const shouldReconnect =
      closeReason !== "unauthorized" &&
      closeReason !== "forbidden" &&
      closeReason !== "session_expired";

    if (shouldReconnect) {
      window.setTimeout(() => {
        if (!socket) {
          ensureSocket();
        }
      }, 1500);
    }

    if (continuationHandshake) {
      continuationHandshake.reject(new Error("Agent WebSocket disconnected"));
      continuationHandshake = null;
    }

    if (activeStream) {
      const stream = activeStream;
      stream.finish(() =>
        stream.reject(new Error("Agent WebSocket disconnected")),
      );
      if (activeStream === stream) {
        activeStream = null;
      }
    }
  });

  ws.addEventListener("error", () => {
    connectionError.value = "Agent connection error";
  });

  ws.addEventListener("message", handleSocketMessage);
  socketListenerAttached = true;
}

function parseSocketMessage(
  event: MessageEvent,
): Record<string, unknown> | null {
  if (typeof event.data !== "string") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function handleSocketMessage(event: MessageEvent): void {
  const data = parseSocketMessage(event);
  if (!data) {
    return;
  }

  if (data.type === "cf_agent_stream_resuming" && typeof data.id === "string") {
    if (continuationHandshake) {
      expectsToolContinuation = false;
      continuationHandshake.resolve(data.id);
      continuationHandshake = null;
    } else if (expectsToolContinuation) {
      // Tool continuations can be announced before the original stream has
      // delivered its terminal frame. Hold the id until the caller installs
      // the next ActiveStream, then ACK it so no continuation chunks are lost.
      bufferedToolContinuationRequestId = data.id;
    }
    return;
  }

  const statusResult = AgentWsTurnStatusFrameSchema.safeParse(data);
  if (statusResult.success) {
    if (activeStream && statusResult.data.id === activeStream.requestId) {
      activeStream.markAccepted(statusResult.data.phase);
    }
    return;
  }

  if (!activeStream) {
    return;
  }

  const frameResult = AgentWsChatResponseFrameSchema.safeParse(data);
  if (!frameResult.success || frameResult.data.id !== activeStream.requestId) {
    return;
  }

  const stream = activeStream;
  const frame = frameResult.data;
  stream.markModelEventReceived();

  // Convert the WS frame to a standardised AgentStreamEvent,
  // then delegate accumulation to the shared consumer.
  const streamEvent = wsFrameToStreamEvent(frame, {
    toolNameByCallId: stream.toolNameByCallId,
  });

  if (!streamEvent) {
    // Frame with no user-facing content (keepalive, SDK-internal, etc.)
    if (frame.done && !frame.error) {
      // done frame with no body — resolve with current state
      requestStreamFinish(stream);
    }
    return;
  }

  if (streamEvent.type === "error") {
    stream.onEvent?.(streamEvent);
    stream.finish(() => stream.reject(new Error(streamEvent.error)));
    activeStream = null;
    return;
  }

  if (streamEvent.type === "finished") {
    stream.onEvent?.(streamEvent);
    requestStreamFinish(stream);
    return;
  }

  // Forward to shared consumer
  const update = consumeStreamEvent(stream.consumerState, streamEvent);
  stream.onEvent?.(streamEvent);

  // Drive the existing callbacks from consumer update flags
  if (update.contentUpdated) {
    stream.onDelta(stream.consumerState.text);
  }
  if (update.reasoningUpdated && stream.onReasoning) {
    stream.onReasoning(stream.consumerState.reasoning ?? "");
  }
  if (update.toolStepsUpdated && stream.onToolSteps) {
    stream.onToolSteps(stream.consumerState.toolSteps);
  }

  if (
    streamEvent.type === "tool-call" &&
    stream.onClientToolCall &&
    stream.consumerState.pendingClientTools.some(
      (tool) => tool.toolCallId === streamEvent.toolCallId,
    ) &&
    !stream.dispatchedClientToolCallIds.has(streamEvent.toolCallId)
  ) {
    dispatchClientToolCall(stream, {
      toolName: streamEvent.toolName,
      toolCallId: streamEvent.toolCallId,
      input: streamEvent.args,
    });
  }
}

function dispatchClientToolCall(
  stream: ActiveStream,
  tool: AgentWsPendingClientTool,
): void {
  const handler = stream.onClientToolCall;
  if (!handler) return;

  stream.dispatchedClientToolCallIds.add(tool.toolCallId);
  const task = Promise.resolve().then(() => handler(tool));
  stream.pendingClientToolTasks.add(task);

  void task
    .then(() => {
      stream.consumerState.pendingClientTools =
        stream.consumerState.pendingClientTools.filter(
          (pending) => pending.toolCallId !== tool.toolCallId,
        );
    })
    .catch((error: unknown) => {
      if (activeStream !== stream) return;
      sendCancelRequest(stream.requestId);
      stream.finish(() =>
        stream.reject(
          error instanceof Error
            ? error
            : new Error("The canvas update could not be completed."),
        ),
      );
      activeStream = null;
    })
    .finally(() => {
      stream.pendingClientToolTasks.delete(task);
      if (
        activeStream === stream &&
        stream.finishRequested &&
        stream.pendingClientToolTasks.size === 0
      ) {
        finishStream(stream);
      }
    });
}

function requestStreamFinish(stream: ActiveStream): void {
  if (stream.pendingClientToolTasks.size > 0) {
    stream.finishRequested = true;
    return;
  }
  finishStream(stream);
}

/** Extract final results from the consumer state and resolve the stream. */
function finishStream(stream: ActiveStream): void {
  const state = stream.consumerState;
  stream.finish(() =>
    stream.resolve({
      content: state.text,
      toolSteps: state.toolSteps,
      pendingClientTools: state.pendingClientTools,
      consumerState: state,
    }),
  );
  activeStream = null;
}

function ensureSocket(): WebSocket {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return socket;
  }

  const ws = new WebSocket(buildAgentWebSocketUrl());
  socket = ws;
  attachSocketListeners(ws);
  return ws;
}

async function waitForSocketOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return;
  }

  if (ws.readyState !== WebSocket.CONNECTING) {
    throw new Error("Agent WebSocket is not connected");
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
      action();
    };

    const onOpen = (): void => {
      finish(resolve);
    };
    const onError = (): void => {
      finish(() => reject(new Error("Agent WebSocket connection failed")));
    };
    const onClose = (): void => {
      finish(() =>
        reject(new Error("Agent WebSocket closed before connecting")),
      );
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
    timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("Agent WebSocket connection timed out")));
    }, SOCKET_OPEN_TIMEOUT_MS);
  });
}

function cancelActiveRequest(): void {
  expectsToolContinuation = false;
  bufferedToolContinuationRequestId = null;
  if (!activeStream) {
    return;
  }

  const stream = activeStream;
  sendCancelRequest(stream.requestId);

  stream.finish(() => stream.reject(new DOMException("Aborted", "AbortError")));
  if (activeStream === stream) {
    activeStream = null;
  }
}

function sendCancelRequest(requestId: string): void {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(
        JSON.stringify({
          id: requestId,
          type: "cf_agent_chat_request_cancel",
        }),
      );
    } catch {
      // Ignore send failures during teardown.
    }
  }
}

function waitForContinuationRequestId(
  ws: WebSocket,
  signal?: AbortSignal,
): Promise<string> {
  if (bufferedToolContinuationRequestId) {
    const requestId = bufferedToolContinuationRequestId;
    bufferedToolContinuationRequestId = null;
    expectsToolContinuation = false;
    return Promise.resolve(requestId);
  }

  return new Promise<string>((resolve, reject) => {
    if (continuationHandshake) {
      reject(
        new Error("Another continuation handshake is already in progress"),
      );
      return;
    }

    let timeoutId: number | undefined;
    let settled = false;

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      signal?.removeEventListener("abort", onAbort);
      continuationHandshake = null;
      action();
    };

    const onAbort = (): void => {
      expectsToolContinuation = false;
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };

    continuationHandshake = {
      resolve: (requestId) => {
        finish(() => resolve(requestId));
      },
      reject: (error) => {
        finish(() => reject(error));
      },
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    timeoutId = window.setTimeout(() => {
      if (!settled && continuationHandshake) {
        expectsToolContinuation = false;
        continuationHandshake.reject(
          new Error("Timed out waiting for agent tool continuation"),
        );
      }
    }, CONTINUATION_HANDSHAKE_TIMEOUT_MS);

    try {
      ws.send(JSON.stringify({ type: "cf_agent_stream_resume_request" }));
    } catch (error) {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to request tool continuation"),
        ),
      );
    }
  });
}

function beginActiveStream(input: {
  requestId: string;
  consumerState: StreamConsumerState;
  onDelta: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onToolSteps?: (steps: AgentToolStep[]) => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onTurnStatus?: (phase: AgentWsTurnStatusPhase) => void;
  onClientToolCall?: (tool: AgentWsPendingClientTool) => Promise<void>;
  signal?: AbortSignal;
  initiallyAccepted?: boolean;
}): Promise<AgentWsStreamChatResult> {
  cancelActiveRequest();

  return new Promise<AgentWsStreamChatResult>((resolve, reject) => {
    let settled = false;
    let accepted = false;
    let modelEventReceived = false;
    let acceptTimeoutId: number | undefined;
    let firstModelEventTimeoutId: number | undefined;
    let abortListener: (() => void) | undefined;

    const clearAcceptTimeout = (): void => {
      if (acceptTimeoutId !== undefined) {
        window.clearTimeout(acceptTimeoutId);
        acceptTimeoutId = undefined;
      }
    };

    const clearFirstModelEventTimeout = (): void => {
      if (firstModelEventTimeoutId !== undefined) {
        window.clearTimeout(firstModelEventTimeoutId);
        firstModelEventTimeoutId = undefined;
      }
    };

    const startFirstModelEventTimeout = (): void => {
      if (
        settled ||
        modelEventReceived ||
        firstModelEventTimeoutId !== undefined
      ) {
        return;
      }

      firstModelEventTimeoutId = window.setTimeout(() => {
        const stream = activeStream;
        if (!stream || stream.requestId !== input.requestId) {
          return;
        }

        sendCancelRequest(stream.requestId);
        stream.finish(() =>
          stream.reject(
            new Error(
              "The model accepted the request but took too long to begin. Try again or choose another model.",
            ),
          ),
        );
        if (activeStream === stream) {
          activeStream = null;
        }
      }, AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS);
    };

    const markAccepted = (phase?: AgentWsTurnStatusPhase): void => {
      if (!accepted) {
        accepted = true;
        clearAcceptTimeout();
        startFirstModelEventTimeout();
      }
      if (phase) {
        input.onTurnStatus?.(phase);
      }
    };

    const markModelEventReceived = (): void => {
      markAccepted();
      modelEventReceived = true;
      clearFirstModelEventTimeout();
    };

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearAcceptTimeout();
      clearFirstModelEventTimeout();
      if (abortListener && input.signal) {
        input.signal.removeEventListener("abort", abortListener);
      }
      action();
    };

    activeStream = {
      requestId: input.requestId,
      consumerState: input.consumerState,
      onDelta: input.onDelta,
      onReasoning: input.onReasoning,
      onToolSteps: input.onToolSteps,
      onEvent: input.onEvent,
      onTurnStatus: input.onTurnStatus,
      onClientToolCall: input.onClientToolCall,
      toolNameByCallId: new Map(),
      dispatchedClientToolCallIds: new Set(),
      pendingClientToolTasks: new Set(),
      finishRequested: false,
      resolve,
      reject,
      finish,
      markAccepted,
      markModelEventReceived,
    };

    acceptTimeoutId = window.setTimeout(() => {
      const stream = activeStream;
      if (!stream || stream.requestId !== input.requestId) {
        return;
      }

      sendCancelRequest(stream.requestId);
      stream.finish(() =>
        stream.reject(
          new Error(
            "The agent could not accept this request. Check your connection and try again.",
          ),
        ),
      );
      if (activeStream === stream) {
        activeStream = null;
      }
    }, AGENT_WS_ACCEPT_TIMEOUT_MS);

    if (input.initiallyAccepted) {
      markAccepted("accepted");
    }

    abortListener = (): void => {
      cancelActiveRequest();
    };

    if (input.signal) {
      if (input.signal.aborted) {
        abortListener();
        return;
      }
      input.signal.addEventListener("abort", abortListener, { once: true });
    }
  });
}

export function useAgentWsTransport() {
  function connect(): void {
    ensureSocket();
  }

  function disconnect(): void {
    cancelActiveRequest();
    if (continuationHandshake) {
      continuationHandshake.reject(new Error("Agent WebSocket disconnected"));
      continuationHandshake = null;
    }
    socket?.close();
    socket = null;
    socketListenerAttached = false;
    isConnected.value = false;
  }

  async function streamChat(input: {
    messages: AgentChatMessage[];
    composerMode: AgentChatRequestExtras["composerMode"];
    sessionModel?: AgentChatRequestExtras["sessionModel"];
    shellContext?: AgentChatRequestExtras["shellContext"];
    seoContext?: AgentChatRequestExtras["seoContext"];
    clientToolSchemas?: ClientToolSchema[];
    onDelta: (content: string) => void;
    onReasoning?: (reasoning: string) => void;
    onToolSteps?: (steps: AgentToolStep[]) => void;
    onEvent?: (event: AgentStreamEvent) => void;
    onTurnStatus?: (phase: AgentWsTurnStatusPhase) => void;
    onClientToolCall?: (tool: AgentWsPendingClientTool) => Promise<void>;
    signal?: AbortSignal;
  }): Promise<AgentWsStreamChatResult> {
    const ws = ensureSocket();
    await waitForSocketOpen(ws);

    const requestId = createRequestId();
    const consumerState = createStreamConsumerState();
    const streamPromise = beginActiveStream({
      requestId,
      consumerState,
      onDelta: input.onDelta,
      onReasoning: input.onReasoning,
      onToolSteps: input.onToolSteps,
      onEvent: input.onEvent,
      onTurnStatus: input.onTurnStatus,
      onClientToolCall: input.onClientToolCall,
      signal: input.signal,
    });

    if (ws.readyState !== WebSocket.OPEN) {
      cancelActiveRequest();
      throw new Error("Agent WebSocket is not connected");
    }

    ws.send(
      JSON.stringify({
        id: requestId,
        type: "cf_agent_use_chat_request",
        init: {
          method: "POST",
          body: buildAgentChatRequestBody({
            messages: input.messages,
            composerMode: input.composerMode,
            sessionModel: input.sessionModel,
            shellContext: input.shellContext,
            seoContext: input.seoContext,
            clientToolSchemas: input.clientToolSchemas,
          }),
        },
      }),
    );

    return streamPromise;
  }

  function sendToolResult(input: AgentWsToolResultInput): void {
    const ws = ensureSocket();
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error("Agent WebSocket is not connected");
    }

    const payload = buildAgentToolResultPayload(input);
    if (input.autoContinue) {
      expectsToolContinuation = true;
    }
    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      if (input.autoContinue) {
        expectsToolContinuation = false;
      }
      throw error;
    }
  }

  async function awaitContinuationStream(input: {
    consumerState: StreamConsumerState;
    onDelta: (content: string) => void;
    onReasoning?: (reasoning: string) => void;
    onToolSteps?: (steps: AgentToolStep[]) => void;
    onEvent?: (event: AgentStreamEvent) => void;
    onTurnStatus?: (phase: AgentWsTurnStatusPhase) => void;
    onClientToolCall?: (tool: AgentWsPendingClientTool) => Promise<void>;
    signal?: AbortSignal;
  }): Promise<AgentWsStreamChatResult> {
    const ws = ensureSocket();
    await waitForSocketOpen(ws);

    const requestId = await waitForContinuationRequestId(ws, input.signal);

    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error("Agent WebSocket is not connected");
    }

    // Register the stream before acknowledging the resume. The server may
    // replay buffered chunks synchronously as soon as it receives the ACK; if
    // the active stream is installed afterwards, a fast (or already completed)
    // continuation is dropped and the first-response watchdog eventually
    // reports a false timeout.
    const streamPromise = beginActiveStream({
      requestId,
      consumerState: input.consumerState,
      onDelta: input.onDelta,
      onReasoning: input.onReasoning,
      onToolSteps: input.onToolSteps,
      onEvent: input.onEvent,
      onTurnStatus: input.onTurnStatus,
      onClientToolCall: input.onClientToolCall,
      signal: input.signal,
      initiallyAccepted: true,
    });

    try {
      ws.send(
        JSON.stringify({
          type: "cf_agent_stream_resume_ack",
          id: requestId,
        }),
      );
    } catch (error) {
      cancelActiveRequest();
      await streamPromise.catch(() => {});
      throw error;
    }

    return streamPromise;
  }

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    streamChat,
    sendToolResult,
    awaitContinuationStream,
    cancelActiveRequest,
  };
}
