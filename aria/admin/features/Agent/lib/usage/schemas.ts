import { z } from "zod";
import { InferenceBackendIdSchema } from "../schemas";

export const InferenceBillingModeSchema = z.enum([
  "aria_managed",
  "tenant_byok",
  "deployment_binding",
  "unknown_external",
]);
export type InferenceBillingMode = z.infer<
  typeof InferenceBillingModeSchema
>;

export const InferenceRunStatusSchema = z.enum([
  "started",
  "succeeded",
  "failed",
  "aborted",
]);
export type InferenceRunStatus = z.infer<typeof InferenceRunStatusSchema>;

export const NormalizedInferenceUsageSchema = z
  .object({
    inputTokens: z.int().nonnegative().nullable(),
    outputTokens: z.int().nonnegative().nullable(),
    reasoningTokens: z.int().nonnegative().nullable().default(null),
    cachedInputTokens: z.int().nonnegative().nullable().default(null),
    estimatedCostMicros: z.int().nonnegative().nullable().default(null),
    providerReportedCostMicros: z.int().nonnegative().nullable().default(null),
    currency: z.string().length(3).default("USD"),
    pricingSource: z.string().min(1).nullable().default(null),
    pricingVersion: z.string().min(1).nullable().default(null),
    providerRequestId: z.string().min(1).nullable().default(null),
    gatewayRequestId: z.string().min(1).nullable().default(null),
  })
  .strict();
export type NormalizedInferenceUsage = z.infer<
  typeof NormalizedInferenceUsageSchema
>;

export const StartInferenceRunInputSchema = z
  .object({
    requestId: z.string().min(1),
    turnId: z.string().min(1),
    siteId: z.string().min(1),
    userId: z.string().min(1),
    providerInstanceId: z.string().min(1),
    backend: InferenceBackendIdSchema,
    modelId: z.string().min(1),
    billingMode: InferenceBillingModeSchema,
    routeType: z.enum(["direct", "cloudflare_ai_gateway"]),
    transport: z.enum(["studio_ws", "studio_http", "mcp", "background"]),
    feature: z.string().min(1),
  })
  .strict();
export type StartInferenceRunInput = z.infer<
  typeof StartInferenceRunInputSchema
>;

export const InferenceRunSchema = StartInferenceRunInputSchema.extend({
  id: z.uuid(),
  status: InferenceRunStatusSchema,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  finishReason: z.string().nullable(),
  errorCode: z.string().nullable(),
}).strict();
export type InferenceRun = z.infer<typeof InferenceRunSchema>;

export const CompleteInferenceRunInputSchema = z
  .object({
    runId: z.uuid(),
    status: z.enum(["succeeded", "failed", "aborted"]),
    finishReason: z.string().nullable().default(null),
    errorCode: z.string().nullable().default(null),
    usage: NormalizedInferenceUsageSchema.optional(),
  })
  .strict();
export type CompleteInferenceRunInput = z.infer<
  typeof CompleteInferenceRunInputSchema
>;

export const AiQuotaMetricSchema = z.enum([
  "requests",
  "tokens",
  "cost_micros",
]);
export type AiQuotaMetric = z.infer<typeof AiQuotaMetricSchema>;

export const AiQuotaSubjectTypeSchema = z.enum(["site", "user"]);

export const AiQuotaPolicySchema = z
  .object({
    id: z.uuid(),
    siteId: z.string().min(1),
    subjectType: AiQuotaSubjectTypeSchema,
    subjectId: z.string().min(1).nullable(),
    metric: AiQuotaMetricSchema,
    windowSeconds: z.int().positive(),
    warningLimit: z.int().nonnegative().nullable(),
    hardLimit: z.int().positive(),
    reservationUnits: z.int().positive(),
    billingModes: z.array(InferenceBillingModeSchema).min(1),
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AiQuotaPolicy = z.infer<typeof AiQuotaPolicySchema>;

export const SaveAiQuotaPolicyInputSchema = AiQuotaPolicySchema.pick({
  subjectType: true,
  subjectId: true,
  metric: true,
  windowSeconds: true,
  warningLimit: true,
  hardLimit: true,
  reservationUnits: true,
  billingModes: true,
  enabled: true,
})
  .extend({ id: z.uuid().optional() })
  .superRefine((value, context) => {
    if (value.subjectType === "user" && !value.subjectId) {
      context.addIssue({
        code: "custom",
        path: ["subjectId"],
        message: "User quota policies require a subject id",
      });
    }
    if (
      value.warningLimit !== null &&
      value.warningLimit >= value.hardLimit
    ) {
      context.addIssue({
        code: "custom",
        path: ["warningLimit"],
        message: "Warning limit must be less than the hard limit",
      });
    }
  });

export const DeleteAiQuotaPolicyInputSchema = z
  .object({ id: z.uuid() })
  .strict();

export const AiQuotaExceededSchema = z
  .object({
    policyId: z.uuid(),
    metric: AiQuotaMetricSchema,
    hardLimit: z.int().positive(),
    resetAt: z.iso.datetime(),
  })
  .strict();
export type AiQuotaExceeded = z.infer<typeof AiQuotaExceededSchema>;
