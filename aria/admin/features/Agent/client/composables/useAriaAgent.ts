import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import {
  AgentStreamEventSchema,
  AgentShellContextSchema,
} from "../../lib/schemas";
import type { AgentChatMessage, AgentToolStep } from "../../lib/schemas";
import {
  unwrapAgentChatHistoryPayload,
  unwrapAgentClearChatPayload,
} from "./agentActionResults";
import {
  clearLocalChatHistory,
  readLocalChatHistory,
  writeLocalChatHistory,
} from "../../lib/localChatHistory";
import { useAgentAvailability } from "./useAgentAvailability";
import { useAgentSessionPrefs } from "./useAgentSessionPrefs";
import { useAgentSettings } from "./useAgentSettings";
import { useAgentWsTransport } from "./useAgentWsTransport";
import type {
  AgentWsPendingClientTool,
  AgentWsStreamChatResult,
} from "./useAgentWsTransport";
import { useAgentContextRef } from "./useAgentContext";
import { useAgentClientTools } from "./useAgentClientTools";
import type { ClientToolResult } from "./useAgentClientTools";
import { useAgentPanel } from "./useAgentPanel";
import { buildClientToolSchemasForRequest } from "../../lib/clientToolSchemas";
import { notifyAgentPageSeoUpdatedFromToolSteps } from "../../lib/seoAgent";
import type { AgentShellContext } from "../../lib/schemas";
import type { StreamConsumerState } from "../../lib/streamEventConsumer";
import {
  createStreamConsumerState,
  consumeStreamEvent,
} from "../../lib/streamEventConsumer";
import {
  applyClientToolResultToSteps,
  markUnexecutedClientToolSteps,
  mergeToolSteps,
  collapseToolSteps,
  isClientToolName,
} from "../../lib/toolStream";
import {
  activityForStreamEvent,
  activityForToolSteps,
  completeAgentRunTelemetry,
  createAgentActivityState,
  createAgentRunTelemetry,
  fallbackContentForToolOnlyRun,
  labelForTurnStatus,
  markAgentRunTelemetry,
  type AgentActivityState,
  type AgentRunTelemetry,
} from "../../lib/activity";
import {
  sanitizeAgentUserFacingContent,
  sanitizeAgentUserFacingError,
  sanitizeAgentUserFacingMessages,
} from "../../lib/userFacingContent";
import {
  anchorClientToolInputToRunSelection,
  isAgentRunDocumentCurrent,
  isDocumentBoundClientTool,
  resolveAgentRunDocumentIdentity,
} from "../../lib/agentRunContext";
import {
  finishAgentBuild,
  finishAgentRun,
  recordAgentBuildSection,
  registerAgentRun,
  startAgentBuild,
} from "./useAgentRuntimeStatus";
import { AGENT_MAX_STEPS } from "../../lib/constants";
import type { AgentWsTurnStatusPhase } from "../../lib/wsChatProtocol";
import {
  buildDeferredSectionInsertionResult,
  createProgressiveSectionInsertionGate,
  executeClientToolCallOnce,
  hasBatchedRootSectionInsertions,
  isDeferredSectionInsertionResult,
  isProgressiveSectionInsertTool,
} from "../../lib/progressiveBuild";
import { useShellSignalBridge } from "@/features/Core";

/** Known provider-error message patterns that should be hidden from the user. */
const PROVIDER_ERROR_FILTER_PATTERNS = [
  /Messages with role ['"]tool['"] must be a response to a preceding message with ['"]tool_calls['"]/i,
];

function resolveChatError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    // Suppress known provider-level errors that are not actionable by the user.
    if (PROVIDER_ERROR_FILTER_PATTERNS.some((p) => p.test(err.message))) {
      return "The AI provider returned an unexpected response. Please try again.";
    }
    return sanitizeAgentUserFacingError(err.message);
  }

  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message ?? "").trim();
    if (message) {
      if (PROVIDER_ERROR_FILTER_PATTERNS.some((p) => p.test(message))) {
        return "The AI provider returned an unexpected response. Please try again.";
      }
      return sanitizeAgentUserFacingError(message);
    }
  }

  return "Chat failed";
}

async function waitForCanvasPaint(): Promise<void> {
  await nextTick();
  if (typeof window === "undefined") return;

  const frame = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        window.setTimeout(resolve, 0);
      }
    });

  await frame();
  await frame();
}

function insertedNodeIds(result: unknown): string[] {
  if (!result || typeof result !== "object" || !("data" in result)) return [];
  const data = (result as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("nodeIds" in data)) return [];
  const nodeIds = (data as { nodeIds?: unknown }).nodeIds;
  return Array.isArray(nodeIds)
    ? nodeIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
}

function usesLocalChatHistory(platform: string | undefined): boolean {
  return platform === "local";
}

function buildToolResultMessage(
  pending: { toolCallId: string; toolName: string },
  result: unknown,
): AgentChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "tool",
    content: JSON.stringify(result),
    createdAt: new Date().toISOString(),
    toolCallId: pending.toolCallId,
  };
}

export function useAriaAgent() {
  const messages = ref<AgentChatMessage[]>([]);
  const isStreaming = ref(false);
  const error = ref<string | null>(null);
  const activity = ref<AgentActivityState | null>(null);
  const lastRunTelemetry = ref<AgentRunTelemetry | null>(null);
  const availability = useAgentAvailability();
  const sessionPrefs = useAgentSessionPrefs();
  const agentSettings = useAgentSettings();
  const wsTransport = useAgentWsTransport();
  const abortController = ref<AbortController | null>(null);
  const shellContext = useAgentContextRef();
  const clientTools = useAgentClientTools();
  const agentPanel = useAgentPanel();
  const shellSignals = useShellSignalBridge();
  let activityTimer: number | undefined;

  const useWebSocket = (): boolean =>
    availability.availability.value?.platform === "cloudflare" &&
    availability.availability.value.durableAgentAvailable === true;

  function persistLocalMessagesIfNeeded(): void {
    const platform = availability.availability.value?.platform;
    if (!usesLocalChatHistory(platform)) {
      return;
    }
    writeLocalChatHistory(messages.value);
  }

  function loadLocalMessagesIfNeeded(): void {
    const platform = availability.availability.value?.platform;
    if (!usesLocalChatHistory(platform)) {
      return;
    }
    messages.value = sanitizeAgentUserFacingMessages(readLocalChatHistory());
  }

  function connectTransportIfNeeded(): void {
    if (useWebSocket()) {
      wsTransport.connect();
    }
  }

  watch(
    () =>
      [
        availability.availability.value?.platform,
        availability.availability.value?.durableAgentAvailable,
      ] as const,
    ([platform]) => {
      if (usesLocalChatHistory(platform)) {
        loadLocalMessagesIfNeeded();
      }
      connectTransportIfNeeded();
    },
    { immediate: true },
  );

  onMounted(() => {
    connectTransportIfNeeded();
    loadLocalMessagesIfNeeded();
    window.addEventListener("focus", handleWindowFocus);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", handleWindowFocus);
    stopActivityTimer();
    stopGeneration();
  });

  async function handleWindowFocus(): Promise<void> {
    await syncChatHistory();
  }

  function setActivity(
    phase: Parameters<typeof createAgentActivityState>[0],
    label: string,
    options: Parameters<typeof createAgentActivityState>[2] = {},
  ): void {
    activity.value = createAgentActivityState(phase, label, options);
    startActivityTimer();
  }

  function startActivityTimer(): void {
    if (activityTimer !== undefined || typeof window === "undefined") {
      return;
    }
    activityTimer = window.setInterval(() => {
      if (!activity.value) {
        stopActivityTimer();
        return;
      }
      activity.value = {
        ...activity.value,
        elapsedMs: Math.max(0, Date.now() - activity.value.startedAt),
      };
    }, 250);
  }

  function stopActivityTimer(): void {
    if (activityTimer === undefined || typeof window === "undefined") {
      activityTimer = undefined;
      return;
    }
    window.clearInterval(activityTimer);
    activityTimer = undefined;
  }

  async function sendMessage(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || isStreaming.value) {
      return;
    }

    const userMessage: AgentChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    messages.value = [...messages.value, userMessage];
    persistLocalMessagesIfNeeded();
    isStreaming.value = true;
    error.value = null;

    const controller = new AbortController();
    abortController.value = controller;

    const assistantId = crypto.randomUUID();
    registerAgentRun(assistantId);
    let canvasBuildStarted = false;
    let completedSections = 0;
    let canvasBuildOutcome: "success" | "stopped" | "error" = "success";
    let runTelemetry = createAgentRunTelemetry(assistantId);
    lastRunTelemetry.value = null;
    setActivity("preparing", "Preparing request...", {
      requestId: assistantId,
    });
    const assistantMessage: AgentChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    messages.value = [...messages.value, assistantMessage];

    try {
      const chatMessages = messages.value.filter(
        (message) => message.id !== assistantId,
      );
      const availabilityState = availability.availability.value;
      if (!availabilityState) {
        throw new Error("Agent availability is not loaded");
      }
      runTelemetry = markAgentRunTelemetry(runTelemetry, "availabilityReadyAt");
      setActivity("preparing", "Loading agent settings...", {
        requestId: assistantId,
      });

      const sessionModel = sessionPrefs.resolveSessionModelForRequest(
        agentSettings.agentSettings.value,
        availabilityState,
      );
      runTelemetry = markAgentRunTelemetry(runTelemetry, "settingsReadyAt");
      const composerMode = sessionPrefs.composerMode.value;
      const seoContext = agentPanel.pendingSeoContext.value ?? undefined;
      const pendingShell = agentPanel.pendingShellContext.value;
      let requestShellContext: AgentShellContext = pendingShell
        ? AgentShellContextSchema.parse({
            ...shellContext.value,
            ...pendingShell,
          })
        : AgentShellContextSchema.parse(shellContext.value);
      let runDocument = resolveAgentRunDocumentIdentity(requestShellContext);
      let runSelectedBlockId = requestShellContext.selectedBlockId;
      let loopMessages = chatMessages;
      let finalContent = "";
      let toolSteps: AgentToolStep[] = [];
      let wasStopped = false;
      let streamFailed = false;
      let lastFinishReason: string | undefined;
      let wsStreamState: StreamConsumerState | null = null;
      const executedClientToolCallIds = new Set<string>();
      const executedClientToolResults = new Map<
        string,
        ClientToolResult<unknown>
      >();

      const handleTurnStatus = (phase: AgentWsTurnStatusPhase): void => {
        setActivity(
          "thinking",
          labelForTurnStatus(phase, {
            mode: composerMode,
            shellContext: requestShellContext,
            seoContext,
            canvasBuildStarted,
            completedSections,
          }),
          { requestId: assistantId },
        );
      };

      const syncRunTelemetry = (
        event: Parameters<typeof activityForStreamEvent>[0],
      ): void => {
        runTelemetry = markAgentRunTelemetry(
          runTelemetry,
          "firstStreamEventAt",
        );
        if (event.type === "text-delta") {
          runTelemetry = markAgentRunTelemetry(
            runTelemetry,
            "firstTextDeltaAt",
          );
        } else if (event.type === "tool-call") {
          runTelemetry = markAgentRunTelemetry(runTelemetry, "firstToolCallAt");
        } else if (event.type === "tool-result") {
          runTelemetry = markAgentRunTelemetry(
            runTelemetry,
            "firstToolResultAt",
          );
        } else if (event.type === "finish") {
          lastFinishReason = event.finishReason;
        }
      };

      const handleStreamEvent = (
        event: Parameters<typeof activityForStreamEvent>[0],
      ): void => {
        syncRunTelemetry(event);
        if (
          event.type === "tool-result" &&
          event.toolName === "aria_save_entry_translation" &&
          typeof window !== "undefined"
        ) {
          window.dispatchEvent(
            new CustomEvent("aria:cms-entry-translation-saved", {
              detail: event.result,
            }),
          );
        }
        const nextActivity = activityForStreamEvent(event, {
          requestId: assistantId,
          context: {
            mode: composerMode,
            shellContext: requestShellContext,
            seoContext,
            canvasBuildStarted,
            completedSections,
          },
        });
        if (nextActivity) {
          activity.value = nextActivity;
          startActivityTimer();
        }
      };

      const syncActivityFromToolSteps = (
        steps: readonly AgentToolStep[],
      ): void => {
        const nextActivity = activityForToolSteps(steps, {
          requestId: assistantId,
          context: {
            mode: composerMode,
            shellContext: requestShellContext,
            seoContext,
            canvasBuildStarted,
            completedSections,
          },
        });
        if (nextActivity) {
          activity.value = nextActivity;
          startActivityTimer();
        }
      };

      const syncSeoUpdateNotifications = (
        steps: readonly AgentToolStep[],
      ): void => {
        notifyAgentPageSeoUpdatedFromToolSteps(steps, seoContext);
      };

      const updateAssistant = (patch: Partial<AgentChatMessage>): void => {
        messages.value = messages.value.map((message) =>
          message.id === assistantId ? { ...message, ...patch } : message,
        );
      };

      const executeClientToolForRun = async (
        toolName: string,
        input: unknown,
      ) => {
        if (hasBatchedRootSectionInsertions(toolName, input)) {
          canvasBuildOutcome = "error";
          return {
            ok: false as const,
            error: {
              code: "INVALID_INPUT" as const,
              message: "Add one root section at a time.",
              suggestedFix:
                "Submit one section, wait for it to land, then continue with the next section.",
            },
          };
        }

        const isSectionInsert = isProgressiveSectionInsertTool(toolName, input);
        if (isSectionInsert && !canvasBuildStarted) {
          canvasBuildStarted = true;
          startAgentBuild(assistantId);
          shellSignals.broadcastAgentCanvasBuild({
            phase: "started",
            runId: assistantId,
          });
        }

        if (
          isDocumentBoundClientTool(toolName) &&
          !isAgentRunDocumentCurrent(runDocument, shellContext.value)
        ) {
          canvasBuildOutcome = "error";
          return {
            ok: false as const,
            error: {
              code: "CONFLICT" as const,
              message:
                "The open document changed while I was preparing this update.",
              suggestedFix:
                "Return to the original document and ask me to continue, or start a new request for the document now open.",
            },
          };
        }

        if (isSectionInsert) {
          setActivity(
            "running_client_tool",
            `Adding section ${completedSections + 1}...`,
            { requestId: assistantId },
          );
        }

        const result = await clientTools.executeClientTool(
          toolName,
          anchorClientToolInputToRunSelection(
            toolName,
            input,
            runSelectedBlockId,
          ),
        );

        if (isSectionInsert) {
          if (result.ok) {
            completedSections += 1;
            canvasBuildOutcome = "success";
            recordAgentBuildSection(assistantId, completedSections);
            const nodeIds = insertedNodeIds(result);
            if (nodeIds.length > 0) {
              shellSignals.broadcastAgentCanvasBuild({
                phase: "section-inserted",
                runId: assistantId,
                nodeIds,
                sequence: completedSections,
              });
            }
            await waitForCanvasPaint();
          } else {
            canvasBuildOutcome = "error";
          }
        }

        return result;
      };

      for (let attempt = 0; attempt < AGENT_MAX_STEPS; attempt += 1) {
        if (controller.signal.aborted) {
          wasStopped = true;
          break;
        }

        if (useWebSocket()) {
          setActivity("connecting", "Connecting to agent...", {
            requestId: assistantId,
          });
          const activeClientToolSchemas = buildClientToolSchemasForRequest(
            requestShellContext,
            seoContext,
            composerMode,
          );
          const sectionInsertionGate = createProgressiveSectionInsertionGate();
          let clientToolsHandledDuringStream = 0;

          const executeAndSendWsClientTool = async (
            pending: AgentWsPendingClientTool,
            autoContinue: boolean,
          ): Promise<void> => {
            if (controller.signal.aborted) {
              wasStopped = true;
              throw new DOMException("Aborted", "AbortError");
            }

            syncActivityFromToolSteps(toolSteps);
            const toolResult = await executeClientToolCallOnce(
              executedClientToolResults,
              pending.toolCallId,
              async () =>
                sectionInsertionGate.shouldDefer(
                  pending.toolName,
                  pending.input,
                )
                  ? buildDeferredSectionInsertionResult()
                  : executeClientToolForRun(pending.toolName, pending.input),
            );
            sectionInsertionGate.recordResult(
              pending.toolName,
              toolResult.ok && !isDeferredSectionInsertionResult(toolResult),
              pending.input,
            );
            runTelemetry = markAgentRunTelemetry(
              runTelemetry,
              "firstToolResultAt",
            );
            if (pending.toolName === "open_in_composer" && toolResult.ok) {
              requestShellContext = AgentShellContextSchema.parse(
                shellContext.value,
              );
              runDocument =
                resolveAgentRunDocumentIdentity(requestShellContext);
              runSelectedBlockId = requestShellContext.selectedBlockId;
            }
            executedClientToolCallIds.add(pending.toolCallId);
            toolSteps = applyClientToolResultToSteps(
              toolSteps,
              pending.toolCallId,
              pending.toolName,
              toolResult,
            );
            updateAssistant({ toolSteps });
            syncActivityFromToolSteps(toolSteps);
            syncSeoUpdateNotifications(toolSteps);

            const schemasForResult = buildClientToolSchemasForRequest(
              requestShellContext,
              seoContext,
              composerMode,
            );
            wsTransport.sendToolResult({
              toolCallId: pending.toolCallId,
              toolName: pending.toolName,
              output: toolResult,
              state: toolResult.ok ? "output-available" : "output-error",
              errorText: toolResult.ok
                ? undefined
                : [toolResult.error.message, toolResult.error.suggestedFix]
                    .filter(Boolean)
                    .join(" Suggested fix: "),
              autoContinue,
              clientToolSchemas:
                schemasForResult.length > 0 ? schemasForResult : undefined,
            });
            if (wsStreamState) {
              wsStreamState.pendingClientTools =
                wsStreamState.pendingClientTools.filter(
                  (tool) => tool.toolCallId !== pending.toolCallId,
                );
            }
          };

          // Client tools must run while the Cloudflare stream is paused for
          // their result. Serialize sibling calls so the progressive section
          // gate observes each completed insertion before the next one starts.
          let clientToolQueue = Promise.resolve();
          const handleClientToolCall = (
            pending: AgentWsPendingClientTool,
          ): Promise<void> => {
            const queued = clientToolQueue.then(async () => {
              await executeAndSendWsClientTool(pending, true);
              clientToolsHandledDuringStream += 1;
            });
            clientToolQueue = queued.catch(() => {});
            return queued;
          };

          const startOrContinueChat = (): Promise<AgentWsStreamChatResult> => {
            if (wsStreamState) {
              setActivity("connecting", "Continuing your request...", {
                requestId: assistantId,
              });
              return wsTransport.awaitContinuationStream({
                consumerState: wsStreamState,
                signal: controller.signal,
                onEvent: handleStreamEvent,
                onTurnStatus: handleTurnStatus,
                onClientToolCall: handleClientToolCall,
                onDelta: (nextContent) => {
                  finalContent = nextContent;
                  updateAssistant({
                    content: sanitizeAgentUserFacingContent(nextContent),
                    toolSteps,
                  });
                },
                onReasoning: (nextReasoning) => {
                  updateAssistant({ reasoning: nextReasoning });
                },
                onToolSteps: (nextSteps) => {
                  toolSteps = mergeToolSteps(toolSteps, nextSteps);
                  updateAssistant({ toolSteps });
                  syncActivityFromToolSteps(toolSteps);
                  syncSeoUpdateNotifications(toolSteps);
                },
              });
            }
            runTelemetry = markAgentRunTelemetry(
              runTelemetry,
              "transportConnectedAt",
            );
            setActivity("thinking", "Thinking...", {
              requestId: assistantId,
            });
            return wsTransport.streamChat({
              messages: loopMessages,
              composerMode,
              sessionModel,
              shellContext: requestShellContext,
              seoContext: seoContext ?? undefined,
              clientToolSchemas:
                activeClientToolSchemas.length > 0
                  ? activeClientToolSchemas
                  : undefined,
              signal: controller.signal,
              onEvent: handleStreamEvent,
              onTurnStatus: handleTurnStatus,
              onClientToolCall: handleClientToolCall,
              onDelta: (nextContent) => {
                finalContent = nextContent;
                updateAssistant({
                  content: sanitizeAgentUserFacingContent(nextContent),
                  toolSteps,
                });
              },
              onReasoning: (nextReasoning) => {
                updateAssistant({ reasoning: nextReasoning });
              },
              onToolSteps: (nextSteps) => {
                toolSteps = mergeToolSteps(toolSteps, nextSteps);
                updateAssistant({ toolSteps });
                syncActivityFromToolSteps(toolSteps);
                syncSeoUpdateNotifications(toolSteps);
              },
            });
          };

          runTelemetry = markAgentRunTelemetry(runTelemetry, "requestSentAt");
          const streamResult = await startOrContinueChat();

          wsStreamState = streamResult.consumerState;
          finalContent = streamResult.content;
          toolSteps = mergeToolSteps(toolSteps, streamResult.toolSteps);
          if (streamResult.consumerState.finishReason) {
            lastFinishReason = streamResult.consumerState.finishReason;
          }
          updateAssistant({
            content: sanitizeAgentUserFacingContent(finalContent),
            toolSteps,
          });
          syncSeoUpdateNotifications(toolSteps);

          if (clientToolsHandledDuringStream > 0) {
            continue;
          }

          if (!streamResult.pendingClientTools.length) {
            toolSteps = markUnexecutedClientToolSteps(
              toolSteps,
              executedClientToolCallIds,
            );
            updateAssistant({ toolSteps });
            syncSeoUpdateNotifications(toolSteps);
            break;
          }

          for (const [
            pendingIndex,
            pending,
          ] of streamResult.pendingClientTools.entries()) {
            if (controller.signal.aborted) {
              wasStopped = true;
              break;
            }

            await executeAndSendWsClientTool(
              pending,
              pendingIndex === streamResult.pendingClientTools.length - 1,
            );
          }

          if (wasStopped) {
            break;
          }
          continue;
        }

        setActivity("connecting", "Opening stream...", {
          requestId: assistantId,
        });
        runTelemetry = markAgentRunTelemetry(runTelemetry, "requestSentAt");
        const response = await fetch("/api/agent/chat/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: loopMessages,
            composerMode,
            sessionModel,
            shellContext: requestShellContext,
            seoContext: seoContext ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new Error(
            `Chat stream failed (${response.status}): ${errorBody}`,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        // Track tool-calls from the stream so we can:
        // 1. Detect pending client tools (filter by isClientToolName)
        // 2. Build the assistant message with toolCalls for the
        //    continuation loop.
        const toolCallsInStream = new Map<
          string,
          { toolName: string; input: unknown }
        >();

        // Track server tool results from the stream so we can include
        // them in the continuation loop messages. Without these, the
        // provider sees tool-calls in the assistant message with no
        // matching tool-result parts and rejects the request.
        const toolResultsInStream = new Map<
          string,
          { toolName: string; output: unknown }
        >();

        // Shared consumer state — accumulates text, reasoning, tool steps,
        // and pending client tools from stream events.
        const streamState = createStreamConsumerState();
        let streamErrored = false;

        while (true) {
          // If the user pressed stop while we were waiting for data,
          // break early so we don't hang on reader.read().
          if (controller.signal.aborted) {
            wasStopped = true;
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              // Malformed JSON — skip resiliently
              continue;
            }

            const eventResult = AgentStreamEventSchema.safeParse(parsed);
            if (!eventResult.success) continue;

            const event = eventResult.data;
            handleStreamEvent(event);

            // Track tool-call and tool-result IDs so we can reconstruct
            // the full conversation for the continuation loop. Must happen
            // before consumeStreamEvent so the consumer processes the
            // complete tool-call → tool-result chain.
            if (event.type === "tool-call") {
              toolCallsInStream.set(event.toolCallId, {
                toolName: event.toolName,
                input: event.args,
              });
            }
            if (event.type === "tool-result") {
              toolResultsInStream.set(event.toolCallId, {
                toolName: event.toolName,
                output: event.result,
              });
            }

            // The shared consumer throws on error events, so we catch
            // them here before delegation. Partial content stays visible
            // and the error is shown in the composer bar.
            if (event.type === "error") {
              error.value = sanitizeAgentUserFacingError(event.error);
              streamErrored = true;
              break;
            }

            // Delegate state accumulation to the shared consumer
            // (text, reasoning, tool steps, pending client tools).
            const update = consumeStreamEvent(streamState, event);
            if (streamState.finishReason) {
              lastFinishReason = streamState.finishReason;
            }

            // Sync consumer state back to Vue-reactive variables.
            if (update.contentUpdated) {
              finalContent = streamState.text;
              updateAssistant({
                content: sanitizeAgentUserFacingContent(finalContent),
                toolSteps,
              });
            }
            if (update.reasoningUpdated) {
              updateAssistant({ reasoning: streamState.reasoning });
            }
            if (update.toolStepsUpdated) {
              toolSteps = streamState.toolSteps;
              updateAssistant({ toolSteps });
              syncActivityFromToolSteps(toolSteps);
              syncSeoUpdateNotifications(toolSteps);
            }
          }

          // Break the while loop on stream error so we preserve
          // partial content rather than dropping into the catch.
          if (streamErrored) break;
        }

        if (controller.signal.aborted) {
          wasStopped = true;
          break;
        }
        if (streamErrored) {
          streamFailed = true;
          break;
        }

        // Pending client tools = tool calls for client tool names
        // that the browser must execute before continuing the loop.
        const pendingClientTools = Array.from(toolCallsInStream.entries())
          .filter(([_id, info]) => isClientToolName(info.toolName))
          .map(([toolCallId, info]) => ({
            toolCallId,
            toolName: info.toolName,
            input: info.input,
          }));

        // Ensure EVERY non-client tool call has a matching tool result.
        // Server tools that threw during execution produce an error chunk
        // instead of a tool-result chunk, leaving the tool call unmatched.
        // Inject a placeholder so the continuation loop doesn't fail with
        // "Tool result is missing for tool call call_00_..."
        for (const [toolCallId, info] of toolCallsInStream) {
          if (
            !isClientToolName(info.toolName) &&
            !toolResultsInStream.has(toolCallId)
          ) {
            toolResultsInStream.set(toolCallId, {
              toolName: info.toolName,
              output: `Tool ${info.toolName} failed during execution`,
            });
          }
        }

        if (!pendingClientTools.length) {
          toolSteps = markUnexecutedClientToolSteps(
            toolSteps,
            executedClientToolCallIds,
          );
          updateAssistant({
            content: sanitizeAgentUserFacingContent(finalContent),
            toolSteps,
          });
          break;
        }

        // The assistant message must include ALL toolCalls, and for each
        // tool call there must be a corresponding tool-result message.
        // Server tool results come from the stream; client tool results
        // are obtained by executing the pending tools below.

        // Assistant message with all tool-call parts (required by the
        // provider — tool-result messages must match preceding tool-calls).
        // The reasoning field is required by some providers (e.g. DeepSeek
        // thinking mode) which expect reasoning_content to be echoed back.
        const assistantToolCalls = Array.from(toolCallsInStream.entries()).map(
          ([id, info]) => ({
            id,
            toolName: info.toolName,
            input: info.input,
          }),
        );
        loopMessages = [
          ...loopMessages,
          {
            id: assistantId,
            role: "assistant",
            content: finalContent,
            createdAt: new Date().toISOString(),
            toolCalls: assistantToolCalls,
            ...(streamState.reasoning
              ? { reasoning: streamState.reasoning }
              : {}),
          },
        ];

        // Server tool results captured from the stream.
        for (const [toolCallId, info] of toolResultsInStream) {
          if (!isClientToolName(info.toolName)) {
            loopMessages = [
              ...loopMessages,
              buildToolResultMessage(
                { toolCallId, toolName: info.toolName },
                info.output,
              ),
            ];
          }
        }

        // Show client tool steps as running before execution begins.
        // This prevents a visual gap between stream end and tool execution.
        updateAssistant({ toolSteps: [...toolSteps] });
        syncActivityFromToolSteps(toolSteps);

        // Execute pending client tools and append their results.
        const sectionInsertionGate = createProgressiveSectionInsertionGate();
        for (const pending of pendingClientTools) {
          if (controller.signal.aborted) {
            wasStopped = true;
            break;
          }

          // Wrap tool execution in try/catch so a single tool failure
          // doesn't destroy the entire streamed response. The error is
          // captured as a tool-step error and shown inline.
          const toolResult = await executeClientToolCallOnce(
            executedClientToolResults,
            pending.toolCallId,
            async () =>
              sectionInsertionGate.shouldDefer(pending.toolName, pending.input)
                ? buildDeferredSectionInsertionResult()
                : executeClientToolForRun(
                    pending.toolName,
                    pending.input,
                  ).catch((execError: unknown) => ({
                    ok: false as const,
                    error: {
                      code: "INTERNAL" as const,
                      message: resolveChatError(execError),
                    },
                  })),
          );
          sectionInsertionGate.recordResult(
            pending.toolName,
            toolResult.ok && !isDeferredSectionInsertionResult(toolResult),
            pending.input,
          );
          runTelemetry = markAgentRunTelemetry(
            runTelemetry,
            "firstToolResultAt",
          );
          if (pending.toolName === "open_in_composer" && toolResult.ok) {
            requestShellContext = AgentShellContextSchema.parse(
              shellContext.value,
            );
            runDocument = resolveAgentRunDocumentIdentity(requestShellContext);
            runSelectedBlockId = requestShellContext.selectedBlockId;
          }
          executedClientToolCallIds.add(pending.toolCallId);
          toolSteps = applyClientToolResultToSteps(
            toolSteps,
            pending.toolCallId,
            pending.toolName,
            toolResult,
          );
          updateAssistant({ toolSteps });
          syncActivityFromToolSteps(toolSteps);

          loopMessages = [
            ...loopMessages,
            buildToolResultMessage(pending, toolResult),
          ];
        }

        if (wasStopped) {
          break;
        }

        updateAssistant({
          content: sanitizeAgentUserFacingContent(finalContent),
        });
        continue;
      }

      // Collapse retried tools so the user sees only the final state
      // (e.g. insert_nodes error → retry → success shows as one step).
      toolSteps = collapseToolSteps(toolSteps);
      syncSeoUpdateNotifications(toolSteps);

      if (streamFailed) {
        canvasBuildOutcome = "error";
        setActivity("error", "The request stopped before the next update", {
          requestId: assistantId,
        });
        updateAssistant({
          content: sanitizeAgentUserFacingContent(finalContent),
          toolSteps,
        });
        persistLocalMessagesIfNeeded();
        return;
      }

      if (wasStopped || controller.signal.aborted) {
        canvasBuildOutcome = "stopped";
        setActivity("stopped", "Stopped", { requestId: assistantId });
        updateAssistant({
          content: sanitizeAgentUserFacingContent(finalContent),
          toolSteps,
          stopped: true,
        });
        persistLocalMessagesIfNeeded();
        return;
      }

      finalContent = sanitizeAgentUserFacingContent(finalContent);

      if (!finalContent.trim()) {
        finalContent =
          fallbackContentForToolOnlyRun(toolSteps, {
            finishReason: lastFinishReason,
          }) ?? "";
      }

      if (!finalContent.trim()) {
        throw new Error("The agent returned an empty response.");
      }

      updateAssistant({
        content: finalContent,
        toolSteps: toolSteps.length ? toolSteps : undefined,
      });
      const readOnlyNoWrite =
        toolSteps.some(
          (step) => step.isReadTool && step.status === "success",
        ) &&
        !toolSteps.some(
          (step) => !step.isReadTool && step.status === "success",
        );
      if (
        (lastFinishReason === "length" || lastFinishReason === "tool-calls") &&
        readOnlyNoWrite
      ) {
        setActivity("finalizing", "Hit step or token limit...", {
          requestId: assistantId,
        });
      } else {
        setActivity("finalizing", "Done", { requestId: assistantId });
      }

      // Fire-and-forget server persist after successful streaming
      actions.agent
        .syncChatHistory({ messages: messages.value })
        .catch(() => {});

      persistLocalMessagesIfNeeded();
      runTelemetry = completeAgentRunTelemetry(runTelemetry);
      lastRunTelemetry.value = runTelemetry;
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        controller.signal.aborted
      ) {
        canvasBuildOutcome = "stopped";
        setActivity("stopped", "Stopped", { requestId: assistantId });
        messages.value = messages.value.map((message) =>
          message.id === assistantId ? { ...message, stopped: true } : message,
        );
        persistLocalMessagesIfNeeded();
        return;
      }
      canvasBuildOutcome = "error";
      error.value = resolveChatError(err);
      setActivity("error", "Agent hit an error", { requestId: assistantId });
      messages.value = messages.value.filter(
        (message) => message.id !== assistantId,
      );
      persistLocalMessagesIfNeeded();
    } finally {
      if (canvasBuildStarted) {
        shellSignals.broadcastAgentCanvasBuild({
          phase: "finished",
          runId: assistantId,
          outcome: canvasBuildOutcome,
        });
        finishAgentBuild(assistantId);
      }
      finishAgentRun(assistantId);
      isStreaming.value = false;
      abortController.value = null;
      runTelemetry = completeAgentRunTelemetry(runTelemetry);
      lastRunTelemetry.value = runTelemetry;
      window.setTimeout(() => {
        if (!isStreaming.value) {
          activity.value = null;
          stopActivityTimer();
        }
      }, 650);
    }
  }

  function stopGeneration(): void {
    abortController.value?.abort();
    wsTransport.cancelActiveRequest();
    isStreaming.value = false;
    activity.value = createAgentActivityState("stopped", "Stopped");
  }

  async function clearChat(): Promise<void> {
    abortController.value?.abort();
    wsTransport.cancelActiveRequest();
    isStreaming.value = false;
    error.value = null;
    activity.value = null;
    stopActivityTimer();
    abortController.value = null;

    const { data, error: actionError } = await actions.agent.clearChat({});
    if (actionError) {
      throw actionError;
    }
    unwrapAgentClearChatPayload(data);
    messages.value = [];
    if (usesLocalChatHistory(availability.availability.value?.platform)) {
      clearLocalChatHistory();
    }
  }

  async function syncChatHistory(): Promise<void> {
    await availability.refresh();
    connectTransportIfNeeded();

    const platform = availability.availability.value?.platform;

    // Try server-side history first (D1 for local, DO for cloudflare)
    if (useWebSocket() || usesLocalChatHistory(platform)) {
      const { data } = await actions.agent.getChatHistory({});
      if (data) {
        const payload = unwrapAgentChatHistoryPayload(data);
        if (payload.messages.length > 0) {
          messages.value = sanitizeAgentUserFacingMessages(payload.messages);
          return;
        }
      }
      // Fall through to localStorage if server returned empty or errored
    }

    // Fallback to localStorage (fast boot, offline, no D1)
    if (usesLocalChatHistory(platform)) {
      messages.value = sanitizeAgentUserFacingMessages(readLocalChatHistory());
    }
  }

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopGeneration,
    clearChat,
    syncChatHistory,
    availability,
    sessionPrefs,
    agentSettings,
    wsTransport,
    activity,
    lastRunTelemetry,
  };
}
