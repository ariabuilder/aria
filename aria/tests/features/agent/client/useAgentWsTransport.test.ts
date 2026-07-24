import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  onSend?: (data: string) => void;
  readyState = FakeWebSocket.OPEN;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
    this.onSend?.(data);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useAgentWsTransport response watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("cancels and rejects a request that never receives a server frame", async () => {
    const { AGENT_WS_ACCEPT_TIMEOUT_MS, useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Update the design system",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws?.sent).toHaveLength(1);

    const rejection = expect(pending).rejects.toThrow(
      "The agent could not accept this request. Check your connection and try again.",
    );
    await vi.advanceTimersByTimeAsync(AGENT_WS_ACCEPT_TIMEOUT_MS);

    await rejection;
    expect(ws?.sent).toHaveLength(2);
    expect(JSON.parse(ws?.sent[1] ?? "{}")).toMatchObject({
      type: "cf_agent_chat_request_cancel",
    });
  });

  it("clears the watchdog when the first matching response arrives", async () => {
    const {
      AGENT_WS_ACCEPT_TIMEOUT_MS,
      AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS,
      useAgentWsTransport,
    } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-2",
          role: "user",
          content: "Update the palette",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };
    expect(request.id).toBeTypeOf("string");

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          done: true,
        }),
      }),
    );

    await expect(pending).resolves.toMatchObject({ content: "" });
    await vi.advanceTimersByTimeAsync(
      AGENT_WS_ACCEPT_TIMEOUT_MS + AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS,
    );
    expect(ws?.sent).toHaveLength(1);
  });

  it("starts a separate model watchdog after the server accepts the turn", async () => {
    const { AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS, useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const onTurnStatus = vi.fn();
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-slow-model",
          role: "user",
          content: "Build the page",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
      onTurnStatus,
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "aria_agent_turn_status",
          id: request.id,
          phase: "accepted",
        }),
      }),
    );

    expect(onTurnStatus).toHaveBeenCalledWith("accepted");
    const rejection = expect(pending).rejects.toThrow(
      "The model accepted the request but took too long to begin. Try again or choose another model.",
    );
    await vi.advanceTimersByTimeAsync(AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS);
    await rejection;
    expect(JSON.parse(ws?.sent.at(-1) ?? "{}")).toMatchObject({
      type: "cf_agent_chat_request_cancel",
      id: request.id,
    });
  });

  it("reports preparing and generating statuses without resolving the stream", async () => {
    const { useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const onTurnStatus = vi.fn();
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-statuses",
          role: "user",
          content: "Build sections",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
      onTurnStatus,
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };
    for (const phase of ["accepted", "preparing", "generating"] as const) {
      ws?.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "aria_agent_turn_status",
            id: request.id,
            phase,
          }),
        }),
      );
    }
    expect(onTurnStatus.mock.calls.map(([phase]) => phase)).toEqual([
      "accepted",
      "preparing",
      "generating",
    ]);

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          done: true,
        }),
      }),
    );
    await expect(pending).resolves.toMatchObject({ content: "" });
  });

  it("reports a disconnected server independently of either watchdog", async () => {
    const { useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-disconnect",
          role: "user",
          content: "Build a page",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
    });

    await flushMicrotasks();
    const rejection = expect(pending).rejects.toThrow(
      "Agent WebSocket disconnected",
    );
    FakeWebSocket.instances[0]?.close(1011, "server unavailable");
    await rejection;
  });

  it("registers a continuation before acknowledging an immediate replay", async () => {
    const [{ useAgentWsTransport }, { createStreamConsumerState }] =
      await Promise.all([
        import("../../../../admin/features/Agent/client/composables/useAgentWsTransport"),
        import("../../../../admin/features/Agent/lib/streamEventConsumer"),
      ]);
    const transport = useAgentWsTransport();
    transport.connect();

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();
    ws!.onSend = (raw) => {
      const message = JSON.parse(raw) as { type?: string; id?: string };
      if (message.type === "cf_agent_stream_resume_request") {
        ws!.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "cf_agent_stream_resuming",
              id: "continuation-1",
            }),
          }),
        );
      }
      if (message.type === "cf_agent_stream_resume_ack") {
        // Deliberately replay during send(). This reproduces the race where
        // ACK used to precede beginActiveStream().
        ws!.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "cf_agent_use_chat_response",
              id: message.id,
              continuation: true,
              replay: true,
              done: true,
            }),
          }),
        );
      }
    };

    await expect(
      transport.awaitContinuationStream({
        consumerState: createStreamConsumerState(),
        onDelta: vi.fn(),
      }),
    ).resolves.toMatchObject({ content: "" });
    expect(ws?.sent.map((raw) => JSON.parse(raw).type)).toEqual([
      "cf_agent_stream_resume_request",
      "cf_agent_stream_resume_ack",
    ]);
  });

  it("runs a client tool and sends its result before the paused stream finishes", async () => {
    const { useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const transport = useAgentWsTransport();
    const onClientToolCall = vi.fn(async (tool) => {
      transport.sendToolResult({
        toolCallId: tool.toolCallId,
        toolName: tool.toolName,
        output: { ok: true, data: { nodeIds: ["hero"] } },
        autoContinue: true,
      });
    });
    let settled = false;
    const pending = transport
      .streamChat({
        messages: [
          {
            id: "message-client-tool",
            role: "user",
            content: "Add a hero section",
            createdAt: new Date().toISOString(),
          },
        ],
        composerMode: "agent",
        onDelta: vi.fn(),
        onClientToolCall,
      })
      .finally(() => {
        settled = true;
      });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };
    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          body: JSON.stringify({
            type: "tool-input-available",
            toolCallId: "call-hero",
            toolName: "insert_designed_section",
            input: { description: "Hero" },
          }),
        }),
      }),
    );

    await flushMicrotasks();
    expect(onClientToolCall).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws?.sent[1] ?? "{}")).toMatchObject({
      type: "cf_agent_tool_result",
      toolCallId: "call-hero",
      autoContinue: true,
    });
    expect(settled).toBe(false);

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          done: true,
        }),
      }),
    );
    await expect(pending).resolves.toMatchObject({
      pendingClientTools: [],
    });
  });

  it("executes a replayed client tool call only once", async () => {
    const { useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const onClientToolCall = vi.fn(async () => {});
    const transport = useAgentWsTransport();
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-replayed-tool",
          role: "user",
          content: "Add a hero section",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
      onClientToolCall,
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };
    const toolFrame = JSON.stringify({
      type: "cf_agent_use_chat_response",
      id: request.id,
      body: JSON.stringify({
        type: "tool-input-available",
        toolCallId: "call-replayed",
        toolName: "insert_designed_section",
        input: { description: "Hero" },
      }),
    });

    ws?.dispatchEvent(new MessageEvent("message", { data: toolFrame }));
    ws?.dispatchEvent(new MessageEvent("message", { data: toolFrame }));
    await flushMicrotasks();
    expect(onClientToolCall).toHaveBeenCalledTimes(1);

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          done: true,
        }),
      }),
    );
    await expect(pending).resolves.toBeDefined();
  });

  it("buffers a tool continuation announced before the original stream finishes", async () => {
    const { useAgentWsTransport } =
      await import("../../../../admin/features/Agent/client/composables/useAgentWsTransport");
    const transport = useAgentWsTransport();
    const onContinuationToolCall = vi.fn(async () => {});
    const pending = transport.streamChat({
      messages: [
        {
          id: "message-early-continuation",
          role: "user",
          content: "Add a hero section",
          createdAt: new Date().toISOString(),
        },
      ],
      composerMode: "agent",
      onDelta: vi.fn(),
      onClientToolCall: async (tool) => {
        transport.sendToolResult({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          output: { ok: true, data: { nodeIds: ["hero"] } },
          autoContinue: true,
        });
      },
    });

    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    const request = JSON.parse(ws?.sent[0] ?? "{}") as { id?: string };
    ws!.onSend = (raw) => {
      const message = JSON.parse(raw) as { type?: string; id?: string };
      if (message.type === "cf_agent_tool_result") {
        ws!.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "cf_agent_stream_resuming",
              id: "continuation-early",
            }),
          }),
        );
      }
      if (
        message.type === "cf_agent_stream_resume_ack" &&
        message.id === "continuation-early"
      ) {
        ws!.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "cf_agent_use_chat_response",
              id: message.id,
              continuation: true,
              body: JSON.stringify({
                type: "tool-input-available",
                toolCallId: "call-continuation",
                toolName: "insert_nodes",
                input: { nodes: [{ type: "section" }] },
              }),
            }),
          }),
        );
        ws!.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "cf_agent_use_chat_response",
              id: message.id,
              continuation: true,
              done: true,
            }),
          }),
        );
      }
    };

    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          body: JSON.stringify({
            type: "tool-input-available",
            toolCallId: "call-early",
            toolName: "insert_designed_section",
            input: { description: "Hero" },
          }),
        }),
      }),
    );
    await flushMicrotasks();
    ws?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "cf_agent_use_chat_response",
          id: request.id,
          done: true,
        }),
      }),
    );
    const firstResult = await pending;

    await expect(
      transport.awaitContinuationStream({
        consumerState: firstResult.consumerState,
        onDelta: vi.fn(),
        onClientToolCall: onContinuationToolCall,
      }),
    ).resolves.toBeDefined();
    expect(onContinuationToolCall).toHaveBeenCalledTimes(1);
    expect(ws?.sent.map((raw) => JSON.parse(raw).type)).toEqual([
      "cf_agent_use_chat_request",
      "cf_agent_tool_result",
      "cf_agent_stream_resume_ack",
    ]);
  });
});
