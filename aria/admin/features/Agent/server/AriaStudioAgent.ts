import { AIChatAgent, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import type {
  ChatRecoveryContext,
  ChatRecoveryOptions,
} from "@cloudflare/ai-chat";
import {
  getCurrentAgent,
  type Connection,
  type ConnectionContext,
} from "agents";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { hasEffectiveCapability } from "../../../../lib/auth";
import { getAuthAdapterAsync } from "../../../../lib/auth/getAuthAdapter";
import { getStorageAdapterAsync } from "../../../../lib/storage/getStorageAdapter";
import type {
  RuntimeLocals,
  AriaCloudflareEnv,
} from "../../../../lib/cloudflare/env";
import { mapUiMessagesToAgentChatMessages } from "../lib/chatHistory";
import {
  mergeAgentSettings,
  AgentChatMessageSchema,
} from "../lib/schemas";
import { parseAgentChatRequestExtras } from "../lib/chatRequest";
import { buildAgentSystemPrompt } from "../lib/inference/systemPrompt";
import { formatInferenceError } from "../lib/inference/inferenceErrors";
import { repairCompactedAriaToolCall } from "../lib/inference/toolCallRepair";
import { resolveLanguageModel } from "../lib/inference/resolveModel";
import { listConfiguredBackends } from "../lib/inference/byokStore";
import { getAgentInferenceEnv } from "../lib/inference/runtimeEnv";
import {
  assertModelAllowed,
  resolveRequestInference,
} from "../lib/inferenceSelection";
import { getProviderState } from "../lib/inference/inferenceHelpers";
import { AGENT_MAX_MESSAGES, AGENT_MAX_STEPS } from "../lib/constants";
import {
  AGENT_WS_CLOSE_FORBIDDEN,
  AGENT_WS_CLOSE_UNAUTHORIZED,
} from "../lib/wsCloseReason";
import {
  buildAgentWsTurnStatusFrame,
  type AgentWsTurnStatusPhase,
} from "../lib/wsChatProtocol";
import {
  buildServerAiTools,
  canAgentWriteDesignSystem,
} from "../lib/tools/buildAiTools";
import {
  mergeAgentConnectionAuthState,
  resolveSessionUserFromConnectionState,
  resolveSessionUserFromRequest,
} from "./sessionAuth";
import { combineAbortSignals } from "./inference/combineSignals";
import { createAgentErrorResponse } from "./inference/errorResponse";
import { PROVIDER_TIMEOUT_MS } from "./inference/types";
import { log } from "../../../../lib/utils/logger";
import { resolveSiteId } from "../lib/siteId";
import { normalizeAiSdkUsage, startAiUsageRun } from "../lib/usage/service";

export type AgentWorkerEnv = AriaCloudflareEnv;

function createWorkerLocals(env: AgentWorkerEnv): RuntimeLocals {
  return { cfBindings: env };
}

export class AriaStudioAgent extends AIChatAgent<AgentWorkerEnv> {
  static options = { sendIdentityOnConnect: false };

  declare env: AgentWorkerEnv;

  maxPersistedMessages = AGENT_MAX_MESSAGES;
  override chatRecovery = {
    maxAttempts: 6,
    terminalMessage:
      "The agent was interrupted and could not recover this turn. Please try again.",
  };

  override async onChatRecovery(
    context: ChatRecoveryContext,
  ): Promise<ChatRecoveryOptions> {
    log("warn", "[Agent] Recovering interrupted chat turn", {
      incidentId: context.incidentId,
      recoveryKind: context.recoveryKind,
    });
    return {};
  }

  private loadMessageTimestampMap(): Map<string, string> {
    const rows = this.sql<{ id: string; created_at: string }>`
      select id, created_at from cf_ai_chat_agent_messages
      order by created_at asc
    `;

    const timestampById = new Map<string, string>();
    for (const row of rows) {
      timestampById.set(row.id, new Date(row.created_at).toISOString());
    }
    return timestampById;
  }

  async getPersistedChatHistory(): Promise<
    z.infer<typeof AgentChatMessageSchema>[]
  > {
    const messages = mapUiMessagesToAgentChatMessages(
      this.messages,
      this.loadMessageTimestampMap(),
    );
    return z.array(AgentChatMessageSchema).max(250).parse(messages);
  }

  async clearPersistedChatHistory(): Promise<{ cleared: true }> {
    this.resetTurnState();
    this.sql`delete from cf_ai_chat_agent_messages`;
    this.messages = [];
    return { cleared: true };
  }

  async onConnect(
    connection: Connection<Record<string, unknown>>,
    ctx: ConnectionContext,
  ): Promise<void> {
    const locals = createWorkerLocals(this.env);
    const user = await resolveSessionUserFromRequest(ctx.request, locals);
    if (!user) {
      connection.close(AGENT_WS_CLOSE_UNAUTHORIZED, "unauthorized");
      return;
    }

    if (!hasEffectiveCapability(user, "useStudioAgent")) {
      connection.close(AGENT_WS_CLOSE_FORBIDDEN, "forbidden");
      return;
    }

    connection.setState((state) =>
      mergeAgentConnectionAuthState(state, user.id),
    );
  }

  async onChatMessage(
    _onFinish: Parameters<AIChatAgent<AgentWorkerEnv>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<AgentWorkerEnv>["onChatMessage"]>[1],
  ): Promise<Response | undefined> {
    const requestId = crypto.randomUUID();
    const turnId = this.messages.at(-1)?.id ?? requestId;
    const statusRequestId = options?.requestId;

    this.sendTurnStatus(statusRequestId, "accepted");

    try {
      return await this.runChatMessage(options, {
        requestId,
        turnId,
        statusRequestId,
      });
    } catch (error) {
      const message = formatInferenceError(error);
      log("error", "[Agent] Chat setup failed", {
        requestId,
        turnId,
        error: message,
      });
      return createAgentErrorResponse(message);
    }
  }

  private async runChatMessage(
    options:
      | Parameters<AIChatAgent<AgentWorkerEnv>["onChatMessage"]>[1]
      | undefined,
    ids: { requestId: string; turnId: string; statusRequestId?: string },
  ): Promise<Response> {
    this.sendTurnStatus(ids.statusRequestId, "preparing");
    const locals = createWorkerLocals(this.env);
    const storageAdapter = await getStorageAdapterAsync(locals);
    const authAdapter = await getAuthAdapterAsync(locals);
    const { connection } = getCurrentAgent<AriaStudioAgent>();
    const user = await resolveSessionUserFromConnectionState(
      connection?.state,
      authAdapter,
    );

    if (!user) {
      log("warn", "[Agent] Connection identity is unavailable", {
        requestId: ids.requestId,
        turnId: ids.turnId,
        connectionId: connection?.id,
      });
      return createAgentErrorResponse(
        "Your agent connection needs to reconnect. Reload the page and try again.",
      );
    }

    if (!hasEffectiveCapability(user, "useStudioAgent")) {
      log("warn", "[Agent] Connection user no longer has agent access", {
        requestId: ids.requestId,
        turnId: ids.turnId,
        userId: user.id,
      });
      return createAgentErrorResponse(
        "You do not have permission to use Aria Engineer.",
      );
    }

    const siteSettings = await storageAdapter.getSiteSettings();
    const requestExtras = parseAgentChatRequestExtras(options?.body);
    const agentSettings = mergeAgentSettings(siteSettings?.agent, {});

    const resolved = resolveRequestInference({
      settings: agentSettings,
      platform: "cloudflare",
      workersAiAvailable: Boolean(this.env.ai),
      configuredBackends: await listConfiguredBackends(authAdapter),
      sessionOverride: requestExtras.sessionModel,
    });

    if (!resolved) {
      throw new Error("Inference is not configured");
    }

    assertModelAllowed(agentSettings, resolved.provider, resolved.modelId);

    const providerState = getProviderState(agentSettings, resolved.provider);
    const request =
      (options as { request?: Request } | undefined)?.request ??
      new Request("https://aria.internal/ws");
    const siteId = resolveSiteId({ siteSettings, request });
    const route = providerState?.route ?? { type: "direct" as const };

    const model = await resolveLanguageModel({
      platform: "cloudflare",
      backend: resolved.provider,
      modelId: resolved.modelId,
      env: getAgentInferenceEnv(locals),
      authAdapter,
      openaiCompatibleBaseUrl: providerState?.baseUrl,
      route,
      requestMetadata: {
        siteId,
        userId: user.id,
        requestId: ids.requestId,
        turnId: ids.turnId,
        feature: "studio_agent",
      },
    });
    const usageRun = await startAiUsageRun(locals, {
      requestId: ids.requestId,
      turnId: ids.turnId,
      siteId,
      userId: user.id,
      providerInstanceId: resolved.instanceId,
      backend: resolved.provider,
      modelId: resolved.modelId,
      billingMode:
        resolved.provider === "workers_ai"
          ? "deployment_binding"
          : "tenant_byok",
      routeType: route.type,
      transport: "studio_ws",
      feature: "studio_agent",
    });

    const serverTools = buildServerAiTools({
      transport: "studio_ws",
      actionContext: {
        locals,
        request,
        user: user ?? null,
      },
      siteId,
      shellContext: requestExtras.shellContext,
      seoContext: requestExtras.seoContext,
      composerMode: requestExtras.composerMode,
    });
    const clientTools = createToolsFromClientSchemas(
      options?.clientTools?.length ? options.clientTools : undefined,
    );
    const tools = { ...serverTools, ...clientTools };

    const modelMessages = await convertToModelMessages(this.messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    } as any);

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(
      () => timeoutController.abort(),
      PROVIDER_TIMEOUT_MS,
    );
    const combinedSignal = combineAbortSignals(
      options?.abortSignal,
      timeoutController.signal,
    );

    try {
      this.sendTurnStatus(ids.statusRequestId, "generating");
      const result = streamText({
        model,
        system: buildAgentSystemPrompt({
          settings: agentSettings,
          mode: requestExtras.composerMode,
          shellContext: requestExtras.shellContext,
          seoContext: requestExtras.seoContext,
          canWriteDesignSystem: canAgentWriteDesignSystem({
            locals,
            request,
            user: user ?? null,
          }),
        }),
        messages: modelMessages,
        tools: tools as ToolSet | undefined,
        experimental_repairToolCall: repairCompactedAriaToolCall,
        stopWhen: stepCountIs(AGENT_MAX_STEPS),
        abortSignal: combinedSignal,
        onFinish: async ({ finishReason, totalUsage }) => {
          clearTimeout(timeoutHandle);
          await usageRun.complete({
            status: "succeeded",
            finishReason,
            errorCode: null,
            usage: normalizeAiSdkUsage({
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
            }),
          });
        },
      });

      return result.toUIMessageStreamResponse({
        onError: (error) => {
          clearTimeout(timeoutHandle);
          void usageRun.complete({
            status: "failed",
            finishReason: "error",
            errorCode: "PROVIDER_ERROR",
          });
          return formatInferenceError(error);
        },
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      await usageRun.complete({
        status:
          error instanceof DOMException && error.name === "AbortError"
            ? "aborted"
            : "failed",
        finishReason:
          error instanceof DOMException && error.name === "AbortError"
            ? "abort"
            : "error",
        errorCode:
          error instanceof DOMException && error.name === "AbortError"
            ? "ABORTED"
            : "PROVIDER_ERROR",
      });
      throw error;
    }
  }

  private sendTurnStatus(
    requestId: string | undefined,
    phase: AgentWsTurnStatusPhase,
  ): void {
    if (!requestId) {
      return;
    }

    try {
      const { connection } = getCurrentAgent<AriaStudioAgent>();
      connection?.send(
        JSON.stringify(buildAgentWsTurnStatusFrame(requestId, phase)),
      );
    } catch {
      // Status frames are advisory and must never fail the turn.
    }
  }
}
