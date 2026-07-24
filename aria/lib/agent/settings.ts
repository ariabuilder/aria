import { z } from "zod";
import {
CompareCmsEntryRevisionsRequestSchema,
CreateCmsReviewAnnotationRequestSchema,
GetCmsEntryWorkflowRequestSchema,
ListCmsReviewAnnotationsRequestSchema,
ReopenCmsReviewAnnotationRequestSchema,
ResolveCmsReviewAnnotationRequestSchema,
UpdateCmsEntryWorkflowRequestSchema,
} from "../cms/actionSchemas";

export const AriaCompareEntryRevisionsInputSchema =
  CompareCmsEntryRevisionsRequestSchema;
export const AriaGetEntryReviewInputSchema = GetCmsEntryWorkflowRequestSchema;
export const AriaUpdateEntryReviewInputSchema =
  UpdateCmsEntryWorkflowRequestSchema;
export const AriaListReviewAnnotationsInputSchema =
  ListCmsReviewAnnotationsRequestSchema;
export const AriaCreateReviewAnnotationInputSchema =
  CreateCmsReviewAnnotationRequestSchema;
export const AriaResolveReviewAnnotationInputSchema =
  ResolveCmsReviewAnnotationRequestSchema;
export const AriaReopenReviewAnnotationInputSchema =
  ReopenCmsReviewAnnotationRequestSchema;

export const InferenceBackendIdSchema = z.enum([
  "workers_ai",
  "opencode",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "openai_compatible",
]);
export type InferenceBackendId = z.infer<typeof InferenceBackendIdSchema>;

export const CredentialBackendIdSchema = z.enum([
  "opencode",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "openai_compatible",
]);
export type CredentialBackendId = z.infer<typeof CredentialBackendIdSchema>;

export const OpencodePlanSchema = z.enum(["zen", "go"]);
export type OpencodePlan = z.infer<typeof OpencodePlanSchema>;

export const InferenceProviderStateSchema = z
  .object({
    enabled: z.boolean().default(true),
    defaultModelId: z.string().max(128).optional(),
    enabledModelIds: z.array(z.string().max(128)).default([]),
    opencodePlan: OpencodePlanSchema.optional(),
    baseUrl: z.url().max(512).optional(),
  })
  .strict();

export type InferenceProviderState = z.infer<
  typeof InferenceProviderStateSchema
>;

export const InferenceRouteSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct") }).strict(),
  z
    .object({
      type: z.literal("cloudflare_ai_gateway"),
      accountId: z.string().trim().min(1).max(128),
      gatewayId: z.string().trim().min(1).max(128),
      collectLogPayload: z.boolean().default(false),
    })
    .strict(),
]);
export type InferenceRoute = z.infer<typeof InferenceRouteSchema>;

export const ProviderInstanceSchema = z
  .object({
    id: z.uuid(),
    backend: InferenceBackendIdSchema,
    label: z.string().min(1).max(64),
    enabled: z.boolean().default(true),
    defaultModelId: z.string().max(128).optional(),
    enabledModelIds: z.array(z.string().max(128)).default([]),
    opencodePlan: OpencodePlanSchema.optional(),
    baseUrl: z.url().max(512).optional(),
    route: InferenceRouteSchema.optional(),
  })
  .strict();

export type ProviderInstance = z.infer<typeof ProviderInstanceSchema>;

export const InferenceDefaultSchema = z
  .object({
    instanceId: z.uuid(),
    modelId: z.string().min(1).max(128),
  })
  .strict();

export type InferenceDefault = z.infer<typeof InferenceDefaultSchema>;

export const AgentInferenceSettingsSchema = z
  .object({
    default: InferenceDefaultSchema.optional(),
    providerInstances: z.record(z.string(), ProviderInstanceSchema).default({}),
  })
  .strict();

export type AgentInferenceSettings = z.infer<
  typeof AgentInferenceSettingsSchema
>;

export const DEFAULT_AGENT_INFERENCE: AgentInferenceSettings =
  AgentInferenceSettingsSchema.parse({ providerInstances: {} });

export const AgentSkillSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(2048),
  })
  .strict();

export type AgentSkill = z.infer<typeof AgentSkillSchema>;

const AgentSkillsSchema = z.array(AgentSkillSchema).max(8);

/** Field shape only — safe for `.partial()` and nested site settings schemas. */
export const AgentSettingsFieldsSchema = z
  .object({
    enabled: z.boolean().default(false),
    mcpEnabled: z.boolean().default(false),
    inference: AgentInferenceSettingsSchema.default({ providerInstances: {} }),
    workersAiImageModel: z.string().max(128).optional(),
    siteInstructions: z.string().max(2048).optional(),
    skills: AgentSkillsSchema.default([]),
  })
  .strict();

export type AgentSettingsFields = z.infer<typeof AgentSettingsFieldsSchema>;

function refineAgentSettings(
  value: AgentSettingsFields,
  ctx: z.RefinementCtx,
): void {
  for (const [instanceId, instance] of Object.entries(
    value.inference.providerInstances,
  )) {
    if (
      instance.route?.type === "cloudflare_ai_gateway" &&
      instance.backend !== "openai" &&
      instance.backend !== "openrouter"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["inference", "providerInstances", instanceId, "route"],
        message:
          "Cloudflare AI Gateway routing currently supports OpenAI and OpenRouter providers",
      });
    }
  }

  const siteDefault = value.inference.default;
  if (!siteDefault) {
    return;
  }

  const instance = value.inference.providerInstances[siteDefault.instanceId];
  if (!instance?.enabled) {
    ctx.addIssue({
      code: "custom",
      path: ["inference", "default"],
      message: "Default provider must be enabled",
    });
    return;
  }

  if (!instance.enabledModelIds.includes(siteDefault.modelId)) {
    ctx.addIssue({
      code: "custom",
      path: ["inference", "default"],
      message: "Default model must be enabled for the provider",
    });
  }
}

export const AgentSettingsSchema =
  AgentSettingsFieldsSchema.superRefine(refineAgentSettings);

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

const nullishInferenceDefault = z
  .union([InferenceDefaultSchema, z.null()])
  .optional();
const nullishSiteInstructions = z
  .union([z.string().max(2048), z.null()])
  .optional();
const nullishAgentSkills = z.union([AgentSkillsSchema, z.null()]).optional();
const nullishOptionalString = z
  .union([z.string().max(128), z.null()])
  .optional();

const nullishProviderInstance = z
  .union([ProviderInstanceSchema, z.null()])
  .optional();

const InferenceProvidersPatchSchema = z
  .record(z.string(), nullishProviderInstance)
  .optional();

const InferencePatchSchema = z
  .object({
    default: nullishInferenceDefault,
    providerInstances: InferenceProvidersPatchSchema.optional(),
  })
  .strict();

export const AgentSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    mcpEnabled: z.boolean().optional(),
    inference: InferencePatchSchema.optional(),
    workersAiImageModel: nullishOptionalString,
    siteInstructions: nullishSiteInstructions,
    skills: nullishAgentSkills,
  })
  .strict();

export type AgentSettingsPatch = z.infer<typeof AgentSettingsPatchSchema>;

export function isInferenceConfigPatch(patch: AgentSettingsPatch): boolean {
  return patch.inference !== undefined;
}

function mergeInferenceSettings(
  current: AgentInferenceSettings,
  patch: z.infer<typeof InferencePatchSchema>,
): AgentInferenceSettings {
  const next: AgentInferenceSettings = {
    default: current.default,
    providerInstances: { ...current.providerInstances },
  };

  if (patch.default === null) {
    next.default = undefined;
  } else if (patch.default !== undefined) {
    next.default = patch.default;
  }

  if (patch.providerInstances) {
    for (const [instanceId, instancePatch] of Object.entries(
      patch.providerInstances,
    )) {
      if (instancePatch === null) {
        delete next.providerInstances[instanceId];
        continue;
      }
      if (instancePatch === undefined) {
        continue;
      }
      next.providerInstances[instanceId] = ProviderInstanceSchema.parse({
        ...next.providerInstances[instanceId],
        ...instancePatch,
      });
    }
  }

  if (
    next.default &&
    !next.providerInstances[next.default.instanceId]?.enabledModelIds.includes(
      next.default.modelId,
    )
  ) {
    next.default = undefined;
  }

  return AgentInferenceSettingsSchema.parse(next);
}

export function parseAgentSettings(input: unknown): AgentSettings {
  const parsed = AgentSettingsFieldsSchema.safeParse(input ?? {});
  if (parsed.success) {
    const strict = AgentSettingsSchema.safeParse(parsed.data);
    return strict.success ? strict.data : (parsed.data as AgentSettings);
  }
  return AgentSettingsFieldsSchema.parse({}) as AgentSettings;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = parseAgentSettings({});

export function mergeAgentSettings(
  current: AgentSettings | undefined,
  patch: AgentSettingsPatch,
): AgentSettings {
  const base = parseAgentSettings(current);
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch) as Array<
    [keyof AgentSettingsFields, AgentSettingsPatch[keyof AgentSettingsPatch]]
  >) {
    if (key === "inference") {
      if (value !== undefined) {
        merged.inference = mergeInferenceSettings(
          base.inference,
          value as z.infer<typeof InferencePatchSchema>,
        );
      }
      continue;
    }

    if (value === null) {
      delete merged[key];
      continue;
    }
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  const parsed = AgentSettingsFieldsSchema.parse(merged);
  const strict = AgentSettingsSchema.safeParse(parsed);
  return strict.success ? strict.data : (parsed as AgentSettings);
}

/**
 * Provider instances are the source of truth for whether the agent
 * is on. `enabled` remains in the persisted shape for backwards.
 */
export function hasEnabledInferenceProvider(
  settings: Pick<AgentSettings, "inference">,
): boolean {
  return Object.values(settings.inference.providerInstances).some(
    (provider) => provider.enabled,
  );
}

export function buildRemoveInferenceProviderPatch(
  current: AgentSettings | undefined,
  instanceId: string,
): AgentSettingsPatch {
  const base = parseAgentSettings(current);
  const patch: AgentSettingsPatch = {
    inference: {
      providerInstances: {
        [instanceId]: null,
      },
    },
  };

  const instance = base.inference.providerInstances[instanceId];
  if (base.inference.default?.instanceId === instanceId && instance) {
    const remaining = Object.values(base.inference.providerInstances)
      .filter(
        (inst) =>
          inst.id !== instanceId &&
          inst.enabled &&
          inst.enabledModelIds.length > 0,
      )
      .find(() => true);

    if (remaining) {
      patch.inference!.default = {
        instanceId: remaining.id,
        modelId: remaining.defaultModelId ?? remaining.enabledModelIds[0]!,
      };
    } else {
      patch.inference!.default = null;
    }
  }

  return patch;
}

export const ConfiguredBackendsSchema = z
  .object({
    workers_ai: z.boolean().optional(),
    opencode: z.boolean().optional(),
    openai: z.boolean().optional(),
    anthropic: z.boolean().optional(),
    google: z.boolean().optional(),
    openrouter: z.boolean().optional(),
    openai_compatible: z.boolean().optional(),
  })
  .strict();

export type ConfiguredBackends = z.infer<typeof ConfiguredBackendsSchema>;

export const AgentAvailabilityReasonSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "disabled",
  "feature_off",
  "local_platform",
  "inference_setup_required",
  "workers_ai_unavailable",
]);
export type AgentAvailabilityReason = z.infer<
  typeof AgentAvailabilityReasonSchema
>;

export const AgentPlatformSchema = z.enum(["cloudflare", "local"]);
export type AgentPlatform = z.infer<typeof AgentPlatformSchema>;

export const AgentAvailabilitySchema = z
  .object({
    canUseStudioAgent: z.boolean(),
    canShowAgentShell: z.boolean(),
    platform: AgentPlatformSchema,
    siteEnabled: z.boolean(),
    mcpEnabled: z.boolean(),
    durableAgentAvailable: z.boolean(),
    workersAiAvailable: z.boolean(),
    configuredBackends: ConfiguredBackendsSchema,
    effectiveInferenceBackend: z
      .union([InferenceBackendIdSchema, z.literal("unavailable")])
      .default("unavailable"),
    reason: AgentAvailabilityReasonSchema.optional(),
  })
  .strict();

export type AgentAvailability = z.infer<typeof AgentAvailabilitySchema>;

export const CatalogModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export type CatalogModel = z.infer<typeof CatalogModelSchema>;

export const CatalogModelsResponseSchema = z
  .object({
    models: z.array(CatalogModelSchema),
  })
  .strict();

export const ListOpencodeModelsInputSchema = z
  .object({
    plan: OpencodePlanSchema,
  })
  .strict();

export const ListOpenAiModelsInputSchema = z.object({}).strict();

export const ListAnthropicModelsInputSchema = z.object({}).strict();

export const ListGoogleModelsInputSchema = z.object({}).strict();

export const ListOpenRouterModelsInputSchema = z.object({}).strict();
export type ListOpenRouterModelsInput = z.infer<
  typeof ListOpenRouterModelsInputSchema
>;

export const UpdateAgentProviderFieldsSchema = z
  .object({
    provider: CredentialBackendIdSchema,
    apiKey: z.string().min(1).max(4096),
    baseUrl: z.url().max(512).optional(),
  })
  .strict();

export const UpdateAgentProviderInputSchema =
  UpdateAgentProviderFieldsSchema.superRefine((value, ctx) => {
    if (value.provider === "openai_compatible" && !value.baseUrl?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "Base URL is required for OpenAI-compatible providers",
      });
    }
  });

export type UpdateAgentProviderInput = z.infer<
  typeof UpdateAgentProviderInputSchema
>;

export const RemoveAgentProviderInputSchema = z
  .object({
    provider: CredentialBackendIdSchema,
  })
  .strict();

export type RemoveAgentProviderInput = z.infer<
  typeof RemoveAgentProviderInputSchema
>;

export const RemoveInferenceProviderInputSchema = z
  .object({
    providerId: InferenceBackendIdSchema,
  })
  .strict();

export type RemoveInferenceProviderInput = z.infer<
  typeof RemoveInferenceProviderInputSchema
>;
