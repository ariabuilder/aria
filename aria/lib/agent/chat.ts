import { z } from "zod";
import { AGENT_MAX_MESSAGES } from "./constants";
import type { CatalogModel,InferenceBackendId } from "./settings";
import { CatalogModelsResponseSchema,InferenceBackendIdSchema } from "./settings";

export const AgentChatMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool",
]);
export type AgentChatMessageRole = z.infer<typeof AgentChatMessageRoleSchema>;

export const AgentToolStepSchema = z
  .object({
    id: z.string().min(1),
    toolName: z.string().min(1),
    status: z.enum(["running", "success", "error"]),
    summary: z.string().optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        suggestedFix: z.string().optional(),
        confirmationToken: z.string().optional(),
        confirmationCategory: z.string().optional(),
      })
      .strict()
      .optional(),
    isReadTool: z.boolean().default(false),
  })
  .strict();

export type AgentToolStep = z.infer<typeof AgentToolStepSchema>;

export const AgentToolCallSchema = z
  .object({
    id: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
  })
  .strict();

export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export const AgentChatMessageSchema = z
  .object({
    id: z.string().min(1),
    role: AgentChatMessageRoleSchema,
    content: z.string(),
    createdAt: z.iso.datetime(),
    toolSteps: z.array(AgentToolStepSchema).optional(),
    stopped: z.boolean().optional(),
    toolCallId: z.string().optional(),
    toolCalls: z.array(AgentToolCallSchema).optional(),
    reasoning: z.string().optional(),
  })
  .strict();

export type AgentChatMessage = z.infer<typeof AgentChatMessageSchema>;

const AgentComposerModeValueSchema = z.enum(["ask", "agent"]);

export const AgentComposerModeSchema = z.preprocess(
  (value) => (value === "plan" ? "ask" : value),
  AgentComposerModeValueSchema,
);
export type AgentComposerMode = z.infer<typeof AgentComposerModeSchema>;

export const DEFAULT_AGENT_COMPOSER_MODE: AgentComposerMode = "agent";

export const AgentSessionModelOverrideSchema = z
  .object({
    inferenceProvider: InferenceBackendIdSchema.optional(),
    modelId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type AgentSessionModelOverride = z.infer<
  typeof AgentSessionModelOverrideSchema
>;

export const AgentSessionPrefsSchema = z
  .object({
    composerMode: AgentComposerModeSchema.default("agent"),
    inferenceProvider: InferenceBackendIdSchema.optional(),
    modelId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type AgentSessionPrefs = z.infer<typeof AgentSessionPrefsSchema>;

export const DEFAULT_AGENT_SESSION_PREFS: AgentSessionPrefs =
  AgentSessionPrefsSchema.parse({});

export function parseAgentSessionPrefs(input: unknown): AgentSessionPrefs {
  return AgentSessionPrefsSchema.parse(input ?? {});
}

export const AgentWorkspaceSchema = z.enum([
  "studio",
  "composer",
  "design",
  "collections",
]);
export type AgentWorkspace = z.infer<typeof AgentWorkspaceSchema>;

export const AgentShellModeSchema = z.enum(["studio", "composer"]);
export type AgentShellMode = z.infer<typeof AgentShellModeSchema>;

export const AgentShellSelectedBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();

export const AgentShellDocumentOutlineSchema = z
  .object({
    rootBlockCount: z.int().nonnegative(),
    rootTypes: z.array(z.string().min(1)).max(12),
    selectedBlockPath: z.array(z.string().min(1)).max(12).optional(),
  })
  .strict();

export const AgentShellRouteContextSchema = z
  .object({
    path: z.string().min(1),
    name: z.string().optional(),
    section: z.string().optional(),
  })
  .strict();

export const AgentShellSiteContextSchema = z
  .object({
    siteName: z.string().optional(),
    siteUrl: z.string().optional(),
  })
  .strict();

export const AgentShellCurrentDocumentSeoSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    canonical: z.string().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional(),
    nofollow: z.boolean().optional(),
  })
  .strict();

export const AgentShellCurrentDocumentSchema = z
  .object({
    type: z.enum(["page", "layout", "component"]),
    id: z.string().min(1),
    slug: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    layout: z.string().optional(),
    status: z.string().optional(),
    systemRole: z.string().optional(),
    publicPath: z.string().optional(),
    isDirty: z.boolean().optional(),
    activeSlot: z
      .object({
        name: z.string().min(1),
        label: z.string().optional(),
        scope: z.enum(["page", "layout"]),
      })
      .strict()
      .optional(),
    seo: AgentShellCurrentDocumentSeoSchema.optional(),
    contentExcerpt: z.string().max(600).optional(),
  })
  .strict();

export const AgentShellContextSchema = z
  .object({
    mode: AgentShellModeSchema,
    workspace: AgentWorkspaceSchema,
    itemType: z.enum(["page", "layout", "component"]).nullable(),
    itemSlug: z.string().nullable(),
    itemTitle: z.string().nullable(),
    pageId: z.string().nullable(),
    selectedBlockId: z.string().nullable(),
    blockCount: z.int().nonnegative(),
    canClientInsert: z.boolean(),
    canClientNavigate: z.boolean(),
    selectedBlock: AgentShellSelectedBlockSchema.optional(),
    documentOutline: AgentShellDocumentOutlineSchema.optional(),
    routeContext: AgentShellRouteContextSchema.optional(),
    siteContext: AgentShellSiteContextSchema.optional(),
    currentDocument: AgentShellCurrentDocumentSchema.optional(),
    cmsEntry: z
      .object({
        collectionId: z.string().min(1),
        collectionName: z.string().min(1),
        entryId: z.string().min(1),
        entryVersion: z.string().min(1),
        entryTitle: z.string(),
        sourceLocale: z.string().min(1),
        activeLocale: z.string().min(1),
        activeLocaleState: z.enum(["source", "translated", "missing", "stale"]),
        existingLocales: z.array(z.string().min(1)),
        missingLocales: z.array(z.string().min(1)),
      })
      .strict()
      .optional(),
  })
  .strict();

export type AgentShellContext = z.infer<typeof AgentShellContextSchema>;

export const AgentSeoCurrentSeoSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().optional(),
    canonical: z.string().optional(),
    noindex: z.boolean().optional(),
    nofollow: z.boolean().optional(),
  })
  .strict();

export const AgentSeoContextSchema = z
  .object({
    pageSlug: z.string().min(1),
    pageTitle: z.string().optional(),
    field: z.enum(["title", "description", "keywords", "general"]).optional(),
    siteUrl: z.string().optional(),
    siteName: z.string().optional(),
    publicPageUrl: z.string().optional(),
    systemRole: z
      .enum(["standard", "not-found", "cms-collection", "cms-entry"])
      .optional(),
    pageDescription: z.string().optional(),
    contentExcerpt: z.string().max(4000).optional(),
    currentSeo: AgentSeoCurrentSeoSchema.optional(),
  })
  .strict();

export type AgentSeoContext = z.infer<typeof AgentSeoContextSchema>;

export const AgentChatInputSchema = z
  .object({
    messages: z.array(AgentChatMessageSchema).min(1).max(250),
    composerMode: AgentComposerModeSchema.default("agent"),
    sessionModel: AgentSessionModelOverrideSchema.optional(),
    shellContext: AgentShellContextSchema.optional(),
    seoContext: AgentSeoContextSchema.optional(),
  })
  .strict();

export type AgentChatInput = z.infer<typeof AgentChatInputSchema>;

export type AgentChatRequestExtras = Pick<
  AgentChatInput,
  "composerMode" | "sessionModel" | "shellContext" | "seoContext"
>;

export const AgentClearChatInputSchema = z
  .object({
    targetUserId: z.uuid().optional(),
  })
  .strict();

export type AgentClearChatInput = z.infer<typeof AgentClearChatInputSchema>;

export const AgentGetChatHistoryInputSchema = z.object({}).strict();

export type AgentGetChatHistoryInput = z.infer<
  typeof AgentGetChatHistoryInputSchema
>;

export const AgentChatHistoryResponseSchema = z
  .object({
    messages: z.array(AgentChatMessageSchema).max(250),
    syncedAt: z.iso.datetime(),
  })
  .strict();

export type AgentChatHistoryResponse = z.infer<
  typeof AgentChatHistoryResponseSchema
>;

export const AgentClearChatResponseSchema = z
  .object({
    cleared: z.literal(true),
    targetUserId: z.uuid(),
  })
  .strict();

export type AgentClearChatResponse = z.infer<
  typeof AgentClearChatResponseSchema
>;

export const LocalChatHistorySchema = z
  .object({
    version: z.literal(1),
    messages: z.array(AgentChatMessageSchema).max(250),
  })
  .strict();

export type LocalChatHistory = z.infer<typeof LocalChatHistorySchema>;

export const StoredProviderCredentialsSchema = z
  .object({
    apiKey: z.string().min(1),
    baseUrl: z.url().optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type StoredProviderCredentials = z.infer<
  typeof StoredProviderCredentialsSchema
>;

export const EncryptedByokPayloadSchema = z
  .object({
    iv: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

export type EncryptedByokPayload = z.infer<typeof EncryptedByokPayloadSchema>;

/**
 * Read-side provider config. `apiKey` is CONSTRAINED to `z.
 */
export const InferenceProviderConfigSchema = z
  .object({
    apiKey: z.undefined().optional(),
    baseUrl: z.url().max(512).optional(),
    configured: z.boolean().default(false),
    updatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type InferenceProviderConfig = z.infer<
  typeof InferenceProviderConfigSchema
>;

export const INFERENCE_PROVIDER_CONFIG_DEFAULT: InferenceProviderConfig =
  InferenceProviderConfigSchema.parse({});

/**
 * Strip any accidental key material from a config-like object before logging.
 * Pure function — does not mutate the input.
 */
export function redactProviderConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "apiKey") {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Validated stream part discriminated union. Covers the subset of AI
 * SDK `TextStreamPart` that carries user-visible content or tool-loop state.
 */
export const InferenceStreamPartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text-delta"),
      /** Matches the existing WS protocol field name (see `AgentWsTextDeltaChunkSchema`). */
      delta: z.string(),
    })
    .strict(),
  /**
   * /** Maps from the AI SDK's internal `reasoning-delta` type.
   * The router normalises `{ type: "reasoning-delta", text: "..
   */
  z
    .object({
      type: z.literal("reasoning"),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-call"),
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-result"),
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      result: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      error: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("finish"),
      finishReason: z.enum([
        "stop",
        "length",
        "content-filter",
        "tool-calls",
        "error",
        "other",
      ]),
      usage: z
        .object({
          promptTokens: z.int().nonnegative(),
          completionTokens: z.int().nonnegative(),
        })
        .optional(),
    })
    .strict(),
]);
export type InferenceStreamPart = z.infer<typeof InferenceStreamPartSchema>;

/**
 * Wraps a validated stream part with its zero-based index.
 * Malformed chunks produce an error part instead of crashing.
 */
export const InferenceStreamChunkSchema = z
  .object({
    index: z.int().nonnegative(),
    part: InferenceStreamPartSchema,
  })
  .strict();
export type InferenceStreamChunk = z.infer<typeof InferenceStreamChunkSchema>;

/**
 * Streaming event sent from the server to the client during
 * a chat stream. Reuses the same shape as `InferenceStreamPartSchema` (text-delta.
 */
export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text-delta"),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reasoning"),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-call"),
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool-result"),
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      result: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      error: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("finish"),
      finishReason: z.enum([
        "stop",
        "length",
        "content-filter",
        "tool-calls",
        "error",
        "other",
      ]),
      usage: z
        .object({
          promptTokens: z.int().nonnegative(),
          completionTokens: z.int().nonnegative(),
        })
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("finished"),
    })
    .strict(),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

/**
 * In-memory retry state for the inference router. `attempt` is 1-indexed.
 */
export const ProviderRetryStateSchema = z
  .object({
    provider: InferenceBackendIdSchema,
    modelId: z.string().min(1),
    attempt: z.int().min(1).max(3).default(1),
    lastError: z.string().optional(),
    lastErrorAt: z.iso.datetime().optional(),
    retryable: z.boolean().default(true),
  })
  .strict();
export type ProviderRetryState = z.infer<typeof ProviderRetryStateSchema>;

/**
 * Single message row in session-backed chat history. `version: z.
 */
export const SessionChatMessageRowSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    role: AgentChatMessageRoleSchema,
    content: z.string(),
    createdAt: z.iso.datetime(),
    toolCallId: z.string().optional(),
  })
  .strict();
export type SessionChatMessageRow = z.infer<typeof SessionChatMessageRowSchema>;

export const SESSION_CHAT_MESSAGE_ROW_VERSION = 1 as const;

/**
 * Batch of chat messages for a single session.
 * The 250-message cap is enforced both at the schema level and in the
 * D1 adapter's `write()` method (prunes before insert).
 */
export const SessionChatHistorySchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    messages: z.array(SessionChatMessageRowSchema).max(AGENT_MAX_MESSAGES),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type SessionChatHistory = z.infer<typeof SessionChatHistorySchema>;

/**
 * Input for the `agent.syncChatHistory` action (added in Step 4).
 * Allows the client to push current messages to the server for D1
 * persistence on local.
 */
export const AgentSyncChatHistoryInputSchema = z
  .object({
    messages: z.array(AgentChatMessageSchema).min(1).max(AGENT_MAX_MESSAGES),
  })
  .strict();
export type AgentSyncChatHistoryInput = z.infer<
  typeof AgentSyncChatHistoryInputSchema
>;

/** @deprecated Use CatalogModel */
export type WorkersAiModel = CatalogModel;

/** @deprecated Use CatalogModelsResponseSchema */
export const WorkersAiModelsResponseSchema = CatalogModelsResponseSchema;

/** @deprecated Use CatalogModelsResponseSchema */
export const OpencodeModelsResponseSchema = CatalogModelsResponseSchema;

/** @deprecated Use InferenceBackendId */
export type AgentInferenceProviderId = InferenceBackendId;

/** @deprecated Use InferenceBackendIdSchema */
export const AgentInferenceProviderIdSchema = InferenceBackendIdSchema;
