import {
  defineAction,
  ActionError,
  type ActionAPIContext,
} from "astro:actions";
import { z } from "astro/zod";
import type { ModelMessage } from "ai";
import {
  getAuthAdapterAsync,
  getAuthUser,
  requireAuth,
  requireOperation,
} from "../../../../lib/auth";
import { hasEffectiveCapability } from "../../../../lib/auth";
import { getStorageAdapterAsync } from "../../../../lib/storage/getStorageAdapter";
import {
  normalizeSiteSettings,
  type SiteSettings,
} from "../../../../lib/storage/adapter";
import { buildAuthorshipSaveContext } from "../../../../lib/authorship/stamping";
import { touchContentRevisionForAction } from "../../../../lib/content-sync/mutations";
import { isFeatureEnabled } from "../../../../lib/features";
import { resolveAgentAvailability } from "../lib/availability";
import {
  createMcpTokenRecord,
  listMcpTokenRecords,
  revokeMcpTokenRecord,
  updateMcpTokenScopes,
} from "../lib/mcp/tokenStore";
import {
  assertMcpScopesAllowedForUser,
  filterAllowedMcpScopes,
} from "../lib/mcp/scopes";
import {
  AgentAvailabilitySchema,
  AgentChatInputSchema,
  AgentChatHistoryResponseSchema,
  AgentClearChatInputSchema,
  AgentClearChatResponseSchema,
  AgentConfirmActionInputSchema,
  AgentSyncChatHistoryInputSchema,
  AgentGetChatHistoryInputSchema,
  CatalogModelsResponseSchema,
  CreateMcpTokenInputSchema,
  CreateMcpTokenResponseSchema,
  ListOpencodeModelsInputSchema,
  ListAnthropicModelsInputSchema,
  ListGoogleModelsInputSchema,
  ListOpenAiModelsInputSchema,
  ListOpenRouterModelsInputSchema,
  McpTokenListItemSchema,
  RevokeMcpTokenInputSchema,
  UpdateMcpTokenInputSchema,
  mergeAgentSettings,
} from "../lib/schemas";
import type { ResolvedModel } from "../server/inference/types";
import {
  assertModelAllowed,
  canUseChatInference,
  resolveRequestInference,
} from "../lib/inferenceSelection";
import { getProviderState } from "../lib/inference/inferenceHelpers";

import { resolveRuntimePlatform } from "../lib/platform";
import { buildToolContext } from "../lib/tools/toolContext";
import { logAgentActivity } from "../lib/tools/activityLog";
import type { RuntimeLocals } from "../../../../lib/cloudflare/env";
import { resolveAgentDoStub } from "../server/agentDoAccess";
import { resolveSessionHistoryAdapter } from "../lib/sessionHistory";
import { readChatHistory, clearChatHistory } from "../lib/localChatHistory";
import { resolveSiteId } from "../lib/siteId";
import {
  CreateExternalMcpConnectionInputSchema,
  DeleteExternalMcpConnectionInputSchema,
  DiscoverExternalMcpConnectionInputSchema,
  ExternalMcpDiscoveryResultSchema,
  ExternalMcpConnectionSchema,
  UpdateExternalMcpConnectionInputSchema,
} from "../lib/mcp/client/schemas";
import {
  createExternalMcpConnection,
  deleteExternalMcpConnection,
  listExternalMcpConnections,
  updateExternalMcpConnection,
  saveExternalMcpManifestIdentity,
} from "../lib/mcp/client/connectionStore";
import { discoverExternalMcpServer } from "../lib/mcp/client/discovery";
import {
  AiQuotaPolicySchema,
  DeleteAiQuotaPolicyInputSchema,
  SaveAiQuotaPolicyInputSchema,
} from "../lib/usage/schemas";
import { AiUsageRepository } from "../lib/usage/repository";
import {
  UndoMutationInputSchema,
  assertUndoResourceUnchanged,
  loadUndoMutation,
  markMutationUndone,
} from "../lib/undo/mutationAudit";

async function resolveAgentRuntime(
  context: ActionAPIContext,
): Promise<ReturnType<typeof resolveAgentAvailability>> {
  const user = await getAuthUser(context);
  const adapter = await getStorageAdapterAsync(context.locals);
  const authAdapter = await getAuthAdapterAsync(context.locals);
  const siteSettings = await adapter.getSiteSettings();
  const platform = await resolveRuntimePlatform(context.locals);
  const locals = context.locals as RuntimeLocals;
  const [
    { listConfiguredBackends },
    { hasAgentDurableObjectBinding, hasWorkersAiBinding },
  ] = await Promise.all([
    import("../lib/inference/byokStore"),
    import("../lib/inference/runtimeEnv"),
  ]);
  const workersAiBindingPresent = hasWorkersAiBinding(locals);
  const durableAgentBindingPresent = hasAgentDurableObjectBinding(locals);

  return resolveAgentAvailability({
    platform,
    featureEnabled: isFeatureEnabled("studio.agent"),
    user,
    siteSettings,
    workersAiBindingPresent,
    configuredBackends: await listConfiguredBackends(authAdapter),
    durableAgentAvailable:
      platform === "cloudflare" && durableAgentBindingPresent,
  });
}

/**
 * MCP deliberately has no separate on/off control. Creating a token is the
 * opt-in, so enable the endpoint before issuing a token that depends on it.
 */
async function enableMcpForTokenCreation(
  context: ActionAPIContext,
  user: Awaited<ReturnType<typeof requireAuth>>,
): Promise<void> {
  const adapter = await getStorageAdapterAsync(context.locals);
  const currentSettings = normalizeSiteSettings(
    (await adapter.getSiteSettings()) ?? {},
  ) as SiteSettings;
  if (mergeAgentSettings(currentSettings.agent, {}).mcpEnabled) {
    return;
  }

  const updatedSettings: SiteSettings = {
    ...currentSettings,
    agent: mergeAgentSettings(currentSettings.agent, { mcpEnabled: true }),
  };
  const authorship = buildAuthorshipSaveContext(user, "save-site-settings");
  await adapter.saveSiteSettings(updatedSettings, authorship);
  await adapter.appendSettingsAuditEntry({
    category: "agent",
    action: "enable-mcp",
    actorId: user.id,
    actorUsername: user.username,
    summary: "Enabled MCP by creating an MCP token",
  });
  await touchContentRevisionForAction(
    adapter,
    {
      mutationKind: "save-site-settings",
      mutationTarget: "agent",
    },
    context,
  );
}

export const agent = {
  getAvailability: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireOperation(context, "agent.getAvailability");
      const availability = await resolveAgentRuntime(context);
      return {
        success: true as const,
        data: AgentAvailabilitySchema.parse(availability),
      };
    },
  }),

  listWorkersAiModels: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listWorkersAiModels");
      const platform = await resolveRuntimePlatform(context.locals);
      if (platform !== "cloudflare") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Workers AI catalog requires Cloudflare runtime",
        });
      }

      const [{ getAgentInferenceEnv }, { listWorkersAiModels }] =
        await Promise.all([
          import("../lib/inference/runtimeEnv"),
          import("../lib/inference/resolveModel"),
        ]);
      const env = getAgentInferenceEnv(context.locals as RuntimeLocals);
      const models = await listWorkersAiModels(env);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  listOpencodeModels: defineAction({
    accept: "json",
    input: ListOpencodeModelsInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.listOpencodeModels");
      await requireAuth(context);

      const authAdapter = await getAuthAdapterAsync(context.locals);
      const [{ loadProviderCredentials }, { fetchOpencodeModels }] =
        await Promise.all([
          import("../lib/inference/byokStore"),
          import("../lib/inference/opencodeCatalog"),
        ]);
      const credentials = await loadProviderCredentials(
        authAdapter,
        "opencode",
      );
      if (!credentials?.apiKey?.trim()) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "OpenCode API key is not configured",
        });
      }

      const models = await fetchOpencodeModels(input.plan, credentials.apiKey);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  listOpenAiModels: defineAction({
    accept: "json",
    input: ListOpenAiModelsInputSchema,
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listOpenAiModels");
      await requireAuth(context);

      const authAdapter = await getAuthAdapterAsync(context.locals);
      const [{ loadProviderCredentials }, { fetchOpenAiCatalog }] =
        await Promise.all([
          import("../lib/inference/byokStore"),
          import("../lib/inference/openaiCatalog"),
        ]);
      const credentials = await loadProviderCredentials(authAdapter, "openai");
      if (!credentials?.apiKey?.trim()) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "OpenAI API key is not configured",
        });
      }

      const models = await fetchOpenAiCatalog(credentials.apiKey);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  listAnthropicModels: defineAction({
    accept: "json",
    input: ListAnthropicModelsInputSchema,
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listAnthropicModels");
      await requireAuth(context);

      const authAdapter = await getAuthAdapterAsync(context.locals);
      const [{ loadProviderCredentials }, { fetchAnthropicCatalog }] =
        await Promise.all([
          import("../lib/inference/byokStore"),
          import("../lib/inference/anthropicCatalog"),
        ]);
      const credentials = await loadProviderCredentials(
        authAdapter,
        "anthropic",
      );
      if (!credentials?.apiKey?.trim()) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Anthropic API key is not configured",
        });
      }

      const models = await fetchAnthropicCatalog(credentials.apiKey);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  listGoogleModels: defineAction({
    accept: "json",
    input: ListGoogleModelsInputSchema,
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listGoogleModels");
      await requireAuth(context);

      const authAdapter = await getAuthAdapterAsync(context.locals);
      const [{ loadProviderCredentials }, { fetchGoogleCatalog }] =
        await Promise.all([
          import("../lib/inference/byokStore"),
          import("../lib/inference/googleCatalog"),
        ]);
      const credentials = await loadProviderCredentials(authAdapter, "google");
      if (!credentials?.apiKey?.trim()) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Google AI API key is not configured",
        });
      }

      const models = await fetchGoogleCatalog(credentials.apiKey);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  listOpenRouterModels: defineAction({
    accept: "json",
    input: ListOpenRouterModelsInputSchema,
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listOpenRouterModels");
      await requireAuth(context);

      const authAdapter = await getAuthAdapterAsync(context.locals);
      const [{ loadProviderCredentials }, { fetchOpenRouterCatalog }] =
        await Promise.all([
          import("../lib/inference/byokStore"),
          import("../lib/inference/openrouterCatalog"),
        ]);
      const credentials = await loadProviderCredentials(
        authAdapter,
        "openrouter",
      );
      if (!credentials?.apiKey?.trim()) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "OpenRouter API key is not configured",
        });
      }

      const models = await fetchOpenRouterCatalog(credentials.apiKey);
      return {
        success: true as const,
        data: CatalogModelsResponseSchema.parse({ models }),
      };
    },
  }),

  getChatHistory: defineAction({
    accept: "json",
    input: AgentGetChatHistoryInputSchema,
    handler: async (_input, context) => {
      await requireOperation(context, "agent.getChatHistory");

      const user = await requireAuth(context);
      const platform = await resolveRuntimePlatform(context.locals);

      // Local path: read from D1 via session adapter, fall back to localStorage
      if (platform !== "cloudflare") {
        const adapter = await resolveSessionHistoryAdapter(context.locals);
        const sessionId = "local-dev-session";
        const messages = await readChatHistory(sessionId, user.id, adapter);

        return {
          success: true as const,
          data: AgentChatHistoryResponseSchema.parse({
            messages,
            syncedAt: new Date().toISOString(),
          }),
        };
      }

      // Cloudflare path: read from DO
      const stub = await resolveAgentDoStub({
        locals: context.locals,
        userId: user.id,
        request: context.request,
      });

      if (!stub) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Agent durable object is not available",
        });
      }

      const messages = await stub.getPersistedChatHistory();
      return {
        success: true as const,
        data: AgentChatHistoryResponseSchema.parse({
          messages,
          syncedAt: new Date().toISOString(),
        }),
      };
    },
  }),

  chat: defineAction({
    accept: "json",
    input: AgentChatInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.chat");
      await requireAuth(context);

      const availability = await resolveAgentRuntime(context);
      if (!availability.canUseStudioAgent) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Agent is not available",
        });
      }

      if (availability.effectiveInferenceBackend === "unavailable") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Inference is not configured",
        });
      }

      const platform = await resolveRuntimePlatform(context.locals);
      const storageAdapter = await getStorageAdapterAsync(context.locals);
      const authAdapter = await getAuthAdapterAsync(context.locals);
      const siteSettings = await storageAdapter.getSiteSettings();
      const agentSettings = mergeAgentSettings(siteSettings?.agent, {});

      const resolved = resolveRequestInference({
        settings: agentSettings,
        platform,
        workersAiAvailable: availability.workersAiAvailable,
        configuredBackends: availability.configuredBackends,
        sessionOverride: input.sessionModel,
      });

      if (
        !resolved ||
        !canUseChatInference({
          settings: agentSettings,
          platform,
          workersAiAvailable: availability.workersAiAvailable,
          configuredBackends: availability.configuredBackends,
        })
      ) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Selected inference is not configured",
        });
      }

      assertModelAllowed(agentSettings, resolved.provider, resolved.modelId);

      const providerState = getProviderState(agentSettings, resolved.provider);

      const resolvedModel: ResolvedModel = {
        instanceId: resolved.instanceId,
        provider: resolved.provider,
        modelId: resolved.modelId,
        billingMode:
          resolved.provider === "workers_ai"
            ? "deployment_binding"
            : "tenant_byok",
        route: providerState?.route ?? { type: "direct" },
        openaiCompatibleBaseUrl: providerState?.baseUrl,
      };

      // Build toolCallId → toolName lookup from assistant messages
      // so we can render proper tool-result parts for matching tool messages.
      const toolCallIdToToolName = new Map<string, string>();
      for (const m of input.messages) {
        if (m.role === "assistant" && m.toolCalls) {
          for (const tc of m.toolCalls) {
            toolCallIdToToolName.set(tc.id, tc.toolName);
          }
        }
      }

      try {
        const { runAgentChatWithTools } = await import("../lib/chatToolLoop");
        const chatResult = await runAgentChatWithTools({
          requestId: crypto.randomUUID(),
          turnId: input.messages.at(-1)?.id ?? crypto.randomUUID(),
          siteId: new URL(context.request.url).hostname,
          platform,
          resolved: resolvedModel,
          deps: {
            locals: context.locals as RuntimeLocals,
            authAdapter,
          },
          settings: agentSettings,
          composerMode: input.composerMode,
          messages: input.messages.flatMap((message): ModelMessage[] => {
            if (message.role === "tool") {
              const toolCallId = message.toolCallId ?? "";
              const toolName =
                toolCallIdToToolName.get(toolCallId) ?? "unknown";

              let parsed: unknown;
              try {
                parsed = JSON.parse(message.content);
              } catch {
                parsed = message.content;
              }

              const output =
                typeof parsed === "string"
                  ? { type: "text" as const, value: parsed }
                  : { type: "json" as const, value: parsed };

              return [
                {
                  role: "tool",
                  content: [
                    {
                      type: "tool-result",
                      toolCallId,
                      toolName,
                      output,
                    },
                  ],
                },
              ] as ModelMessage[];
            }
            if (message.role === "assistant" && message.toolCalls?.length) {
              const parts: Array<
                | { type: "text"; text: string }
                | { type: "reasoning"; text: string }
                | {
                    type: "tool-call";
                    toolCallId: string;
                    toolName: string;
                    input: unknown;
                  }
              > = [];
              if (message.reasoning) {
                parts.push({ type: "reasoning", text: message.reasoning });
              }
              if (message.content) {
                parts.push({ type: "text", text: message.content });
              }
              for (const tc of message.toolCalls) {
                parts.push({
                  type: "tool-call",
                  toolCallId: tc.id,
                  toolName: tc.toolName,
                  input: tc.input,
                });
              }
              return [
                {
                  role: "assistant",
                  content: parts,
                } as ModelMessage,
              ];
            }
            if (message.reasoning) {
              return [
                {
                  role: "assistant",
                  content: [
                    { type: "reasoning", text: message.reasoning },
                    ...(message.content
                      ? [{ type: "text" as const, text: message.content }]
                      : []),
                  ],
                } as ModelMessage,
              ];
            }
            return [
              {
                role: message.role as "user" | "assistant",
                content: message.content,
              },
            ];
          }),
          actionContext: {
            locals: context.locals,
            request: context.request,
            user: await requireAuth(context),
          },
          shellContext: input.shellContext,
          transport: "studio_http",
          seoContext: input.seoContext,
          abortSignal: undefined,
        });

        return {
          success: true as const,
          data: {
            message: {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: chatResult.text,
              createdAt: new Date().toISOString(),
              toolSteps:
                chatResult.toolSteps.length > 0
                  ? chatResult.toolSteps
                  : undefined,
              reasoning: chatResult.reasoning,
            },
            pendingClientTools: chatResult.pendingClientTools,
          },
        };
      } catch (error) {
        const { formatInferenceError } =
          await import("../lib/inference/inferenceErrors");
        throw new ActionError({
          code: "BAD_REQUEST",
          message: formatInferenceError(error),
        });
      }
    },
  }),

  listMcpTokens: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      const user = await requireAuth(context);
      const canManageGlobalTokens = hasEffectiveCapability(
        user,
        "editAgentSettings",
      );
      await requireOperation(
        context,
        canManageGlobalTokens
          ? "agent.listMcpTokens"
          : "agent.listPersonalMcpTokens",
      );
      const records = await listMcpTokenRecords({
        locals: context.locals,
        actorUser: user,
        mode: canManageGlobalTokens ? "global" : "personal",
      });
      return {
        success: true as const,
        data: {
          tokens: z.array(McpTokenListItemSchema).parse(records),
        },
      };
    },
  }),

  listExternalMcpConnections: defineAction({
    accept: "json",
    input: z.object({}).strict(),
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listExternalMcpConnections");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      const connections = await listExternalMcpConnections({
        locals: context.locals,
        siteId,
      });
      return {
        success: true as const,
        data: z.array(ExternalMcpConnectionSchema).parse(connections),
      };
    },
  }),

  createExternalMcpConnection: defineAction({
    accept: "json",
    input: CreateExternalMcpConnectionInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.createExternalMcpConnection");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      return {
        success: true as const,
        data: ExternalMcpConnectionSchema.parse(
          await createExternalMcpConnection({
            locals: context.locals,
            siteId,
            value: input,
          }),
        ),
      };
    },
  }),

  updateExternalMcpConnection: defineAction({
    accept: "json",
    input: UpdateExternalMcpConnectionInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.updateExternalMcpConnection");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      return {
        success: true as const,
        data: ExternalMcpConnectionSchema.parse(
          await updateExternalMcpConnection({
            locals: context.locals,
            siteId,
            value: input,
          }),
        ),
      };
    },
  }),

  deleteExternalMcpConnection: defineAction({
    accept: "json",
    input: DeleteExternalMcpConnectionInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.deleteExternalMcpConnection");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      return {
        success: true as const,
        data: z
          .object({ deleted: z.boolean() })
          .strict()
          .parse({
            deleted: await deleteExternalMcpConnection({
              locals: context.locals,
              siteId,
              value: input,
            }),
          }),
      };
    },
  }),

  discoverExternalMcpConnection: defineAction({
    accept: "json",
    input: DiscoverExternalMcpConnectionInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.discoverExternalMcpConnection");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      const connection = (
        await listExternalMcpConnections({
          locals: context.locals,
          siteId,
        })
      ).find((candidate) => candidate.id === input.id);
      if (!connection) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "MCP connection not found",
        });
      }
      const discovery = ExternalMcpDiscoveryResultSchema.parse(
        await discoverExternalMcpServer(connection.serverUrl),
      );
      await saveExternalMcpManifestIdentity({
        locals: context.locals,
        siteId,
        connectionId: connection.id,
        serverIdentity: discovery.serverIdentity,
        manifestFingerprint: discovery.manifestFingerprint,
      });
      return { success: true as const, data: discovery };
    },
  }),

  listAiQuotaPolicies: defineAction({
    accept: "json",
    input: z.object({}).strict(),
    handler: async (_input, context) => {
      await requireOperation(context, "agent.listAiQuotaPolicies");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      const repository = new AiUsageRepository(context.locals);
      return {
        success: true as const,
        data: z
          .array(AiQuotaPolicySchema)
          .parse(await repository.listQuotaPolicies(siteId)),
      };
    },
  }),

  saveAiQuotaPolicy: defineAction({
    accept: "json",
    input: SaveAiQuotaPolicyInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.saveAiQuotaPolicy");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      const repository = new AiUsageRepository(context.locals);
      return {
        success: true as const,
        data: AiQuotaPolicySchema.parse(
          await repository.saveQuotaPolicy(siteId, input),
        ),
      };
    },
  }),

  deleteAiQuotaPolicy: defineAction({
    accept: "json",
    input: DeleteAiQuotaPolicyInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.deleteAiQuotaPolicy");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteId = resolveSiteId({
        siteSettings: await adapter.getSiteSettings(),
        request: context.request,
      });
      const repository = new AiUsageRepository(context.locals);
      return {
        success: true as const,
        data: z
          .object({ deleted: z.boolean() })
          .strict()
          .parse({
            deleted: await repository.deleteQuotaPolicy(siteId, input),
          }),
      };
    },
  }),

  createMcpToken: defineAction({
    accept: "json",
    input: CreateMcpTokenInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);

      if (input.type === "service") {
        await requireOperation(context, "agent.createMcpToken");
      } else {
        await requireOperation(context, "agent.createMcpTokenPersonal");
      }

      const scopes = filterAllowedMcpScopes(input.scopes);
      if (scopes.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            "At least one supported MCP scope is required (mcp:read, mcp:write, mcp:design, mcp:publish)",
        });
      }

      try {
        // Personal and service tokens are both bounded by the current
        // principal. Service tokens never become an authority escalation.
        assertMcpScopesAllowedForUser(user, scopes);
      } catch (error) {
        throw new ActionError({
          code: "FORBIDDEN",
          message:
            error instanceof Error
              ? error.message
              : "Requested MCP scopes exceed your role",
        });
      }

      await enableMcpForTokenCreation(context, user);

      const created = await createMcpTokenRecord({
        locals: context.locals,
        createdByUserId: user.id,
        createdByUsername: user.username,
        userId: input.type === "personal" ? user.id : null,
        fields: { ...input, scopes },
      });

      return {
        success: true as const,
        data: CreateMcpTokenResponseSchema.parse(created),
      };
    },
  }),

  revokeMcpToken: defineAction({
    accept: "json",
    input: RevokeMcpTokenInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      const canManageGlobalTokens = hasEffectiveCapability(
        user,
        "editAgentSettings",
      );
      await requireOperation(
        context,
        canManageGlobalTokens
          ? "agent.revokeMcpToken"
          : "agent.revokePersonalMcpToken",
      );
      const revoked = await revokeMcpTokenRecord({
        locals: context.locals,
        actorUser: user,
        mode: canManageGlobalTokens ? "global" : "personal",
        tokenId: input.tokenId,
      });
      if (!revoked) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Token not found",
        });
      }
      return { success: true as const, data: { revoked: true as const } };
    },
  }),

  updateMcpToken: defineAction({
    accept: "json",
    input: UpdateMcpTokenInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      const canManageGlobalTokens = hasEffectiveCapability(
        user,
        "editAgentSettings",
      );
      await requireOperation(
        context,
        canManageGlobalTokens
          ? "agent.updateMcpToken"
          : "agent.updatePersonalMcpToken",
      );

      const scopes = filterAllowedMcpScopes(input.scopes);
      if (scopes.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "At least one supported MCP scope is required",
        });
      }

      try {
        assertMcpScopesAllowedForUser(user, scopes);
      } catch (error) {
        throw new ActionError({
          code: "FORBIDDEN",
          message:
            error instanceof Error
              ? error.message
              : "Requested MCP scopes exceed your role",
        });
      }

      let updated: Awaited<ReturnType<typeof updateMcpTokenScopes>>;
      try {
        updated = await updateMcpTokenScopes({
          locals: context.locals,
          actorUser: user,
          mode: canManageGlobalTokens ? "global" : "personal",
          tokenId: input.tokenId,
          scopes,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Token not found") {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Token not found",
          });
        }
        throw error;
      }

      return { success: true as const, data: updated };
    },
  }),

  syncChatHistory: defineAction({
    accept: "json",
    input: AgentSyncChatHistoryInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.chat");
      const user = await requireAuth(context);
      const platform = await resolveRuntimePlatform(context.locals);

      if (platform === "local") {
        const adapter = await resolveSessionHistoryAdapter(context.locals);
        const sessionId = "local-dev-session";
        if (adapter) {
          await adapter.write(sessionId, user.id, input.messages);
        }
      }

      return { success: true as const };
    },
  }),

  clearChat: defineAction({
    accept: "json",
    input: AgentClearChatInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      await requireOperation(context, "agent.clearChat");

      const targetUserId = input.targetUserId ?? user.id;

      if (
        input.targetUserId &&
        input.targetUserId !== user.id &&
        !hasEffectiveCapability(user, "editAgentSettings")
      ) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Cannot clear another user's chat",
        });
      }

      const platform = await resolveRuntimePlatform(context.locals);
      if (platform === "cloudflare") {
        const stub = await resolveAgentDoStub({
          locals: context.locals,
          userId: targetUserId,
          request: context.request,
        });

        if (!stub) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Agent durable object is not available",
          });
        }

        await stub.clearPersistedChatHistory();
      } else {
        const adapter = await resolveSessionHistoryAdapter(context.locals);
        const sessionId = "local-dev-session";
        if (adapter) {
          await clearChatHistory(sessionId, targetUserId, adapter);
        } else {
          // No D1 available — clear localStorage only (client also clears it)
          clearChatHistory(sessionId, targetUserId, null);
        }
      }

      await logAgentActivity({
        locals: context.locals,
        actor: user.id,
        transport: "studio_http",
        toolName: "admin_clear_chat",
        resource: targetUserId,
        status: "success",
        message: input.targetUserId
          ? `Chat cleared by admin ${user.id} for user ${targetUserId}`
          : `Chat self-cleared by ${user.id}`,
      });

      return {
        success: true as const,
        data: AgentClearChatResponseSchema.parse({
          cleared: true,
          targetUserId,
        }),
      };
    },
  }),

  undoMutation: defineAction({
    accept: "json",
    input: UndoMutationInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "agent.undoMutation");
      const user = await requireAuth(context);
      const actionContext = {
        locals: context.locals,
        request: context.request,
        user,
      };
      const record = await loadUndoMutation({
        locals: context.locals,
        siteId: "default",
        actorId: user.id,
        mutationId: input.id,
      });
      if (!record || record.status !== "ready") {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Undo record is unavailable or already used",
        });
      }
      try {
        await assertUndoResourceUnchanged({ actionContext, record });
      } catch (error) {
        throw new ActionError({
          code: "CONFLICT",
          message:
            error instanceof Error
              ? error.message
              : "Document changed after the mutation",
        });
      }
      const { executeTool } = await import("../lib/tools/executeTool");
      const result = await executeTool({
        toolContext: buildToolContext("studio_http", actionContext),
        actionContext,
        toolName: record.inverseToolName,
        args: record.inverseArgs,
      });
      if (!result.ok) {
        throw new ActionError({ code: "BAD_REQUEST", message: result.error });
      }
      await markMutationUndone({
        locals: context.locals,
        mutationId: record.id,
      });
      return {
        success: true as const,
        data: z
          .object({ undone: z.literal(true), mutationId: z.uuid() })
          .strict()
          .parse({ undone: true, mutationId: record.id }),
      };
    },
  }),

  confirmAction: defineAction({
    accept: "json",
    input: AgentConfirmActionInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);

      const toolContext = buildToolContext("studio_http", {
        locals: context.locals,
        user,
        request: context.request,
      });

      const { executeTool } = await import("../lib/tools/executeTool");
      const result = await executeTool({
        toolContext,
        actionContext: {
          locals: context.locals,
          request: context.request,
          user,
        },
        toolName: input.toolName,
        args: input.args,
        confirmationToken: input.confirmationToken,
      });

      if (!result.ok) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      return {
        success: true as const,
        data: { executed: true as const },
      };
    },
  }),
};
