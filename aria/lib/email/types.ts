import { z } from "zod";

export const EmailProviderSchema = z.enum(["cloudflare_email", "smtp", "preview"]);
export const EmailPurposeSchema = z.enum(["system", "forms"]);
export const EmailCredentialStateSchema = z.enum(["missing", "configured", "invalid"]);
export const EmailHealthStateSchema = z.enum(["untested", "healthy", "degraded", "failed"]);
export const EmailDeliveryStatusSchema = z.enum(["pending", "processing", "retry_scheduled", "accepted", "failed_permanent", "canceled"]);
export const EmailAttemptOutcomeSchema = z.enum(["accepted", "queued_by_provider", "transient_failure", "permanent_failure"]);
export const EmailErrorClassSchema = z.enum(["validation", "authentication", "authorization", "rate_limit", "timeout", "network", "recipient", "sender", "provider", "internal"]);
export const EmailAddressSchema = z.email().max(320);
export const EmailAddressListSchema = z.array(EmailAddressSchema).max(50);

export const CloudflareEmailConfigSchema = z.object({
  accountId: z.string().trim().min(1).max(64),
  zoneId: z.string().trim().min(1).max(64),
  sendingDomain: z.string().trim().min(1).max(253).toLowerCase(),
});
export const CloudflareEmailSecretSchema = z.object({ apiToken: z.string().min(1).max(4096) });

export const SmtpConfigSchema = z.object({
  host: z.string().trim().min(1).max(253).toLowerCase(),
  port: z.union([z.literal(465), z.literal(587)]),
  security: z.enum(["tls", "starttls"]),
  username: z.string().trim().min(1).max(320),
  authMethod: z.enum(["plain", "login"]),
}).superRefine((value, context) => {
  if ((value.port === 465 && value.security !== "tls") || (value.port === 587 && value.security !== "starttls")) {
    context.addIssue({ code: "custom", message: "Port 465 requires TLS and port 587 requires STARTTLS" });
  }
});
export const SmtpSecretSchema = z.object({ password: z.string().min(1).max(4096) });
export const PreviewConfigSchema = z.object({ outputDirectory: z.string().trim().max(500).optional() });
export const PreviewSecretSchema = z.object({}).strict();

const ConnectionCommonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  fromEmail: EmailAddressSchema,
  fromName: z.string().trim().max(100).optional(),
  replyToEmail: EmailAddressSchema.optional(),
});
export const EmailConnectionCreateSchema = z.discriminatedUnion("provider", [
  ConnectionCommonSchema.extend({ provider: z.literal("cloudflare_email"), config: CloudflareEmailConfigSchema, secret: CloudflareEmailSecretSchema }),
  ConnectionCommonSchema.extend({ provider: z.literal("smtp"), config: SmtpConfigSchema, secret: SmtpSecretSchema }),
  ConnectionCommonSchema.extend({ provider: z.literal("preview"), config: PreviewConfigSchema.default({}), secret: PreviewSecretSchema.default({}) }),
]);
export const EmailConnectionPatchSchema = ConnectionCommonSchema.partial().extend({ config: z.unknown().optional() });

export const EncryptedEnvelopeSchema = z.object({
  ciphertextBase64: z.string().min(1), ivBase64: z.string().min(1), keyId: z.string().min(1), algorithm: z.literal("AES-256-GCM"),
});
export const EmailConnectionSchema = z.object({
  id: z.uuid(), siteId: z.string().min(1), name: z.string(), provider: EmailProviderSchema,
  enabled: z.boolean(), fromEmail: EmailAddressSchema, fromName: z.string().nullable(), replyToEmail: EmailAddressSchema.nullable(),
  config: z.unknown(), credentialState: EmailCredentialStateSchema, healthState: EmailHealthStateSchema,
  lastCheckedAt: z.string().nullable(), lastErrorCode: z.string().nullable(), lastErrorMessage: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(), createdByUserId: z.string().nullable(), updatedByUserId: z.string().nullable(),
});
export const EmailRouteSchema = z.object({ id: z.uuid(), siteId: z.string(), purpose: EmailPurposeSchema, connectionId: z.uuid(), priority: z.int().nonnegative(), enabled: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
export const EmailDeliverySchema = z.object({
  id: z.uuid(), siteId: z.string(), purpose: EmailPurposeSchema, templateKey: z.string(), templateVersion: z.int().positive(),
  status: EmailDeliveryStatusSchema, providerDisposition: z.string().nullable(), connectionId: z.uuid().nullable(),
  to: EmailAddressListSchema, cc: EmailAddressListSchema, bcc: EmailAddressListSchema, subject: z.string().nullable(),
  payload: EncryptedEnvelopeSchema.nullable(), idempotencyKey: z.string(), attemptCount: z.int().nonnegative(), maxAttempts: z.int().min(1).max(10),
  nextAttemptAt: z.string(), leaseToken: z.string().nullable(), leaseExpiresAt: z.string().nullable(), lastErrorCode: z.string().nullable(), lastErrorMessage: z.string().nullable(),
  providerMessageId: z.string().nullable(), createdByUserId: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), acceptedAt: z.string().nullable(), terminalAt: z.string().nullable(), payloadPurgeAt: z.string().nullable(), metadataPurgeAt: z.string(),
});
export const EmailAttemptSchema = z.object({
  id: z.uuid(), siteId: z.string(), deliveryId: z.uuid(), connectionId: z.uuid(), attemptNumber: z.int().positive(), outcome: EmailAttemptOutcomeSchema,
  errorClass: EmailErrorClassSchema.nullable(), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), providerMessageId: z.string().nullable(), providerResponse: z.record(z.string(), z.unknown()).nullable(), latencyMs: z.int().nonnegative().nullable(), startedAt: z.string(), finishedAt: z.string(),
});
export const SafeEmailDeliverySchema = EmailDeliverySchema.omit({ payload:true, leaseToken:true, leaseExpiresAt:true });

export const DeliveryListQuerySchema = z.object({ status: EmailDeliveryStatusSchema.optional(), purpose: EmailPurposeSchema.optional(), connectionId: z.uuid().optional(), cursor: z.string().optional(), limit: z.int().min(1).max(100).default(50) });
export const EmailQueueMessageSchema = z.object({ version: z.literal(1), siteId: z.string().min(1), deliveryId: z.uuid() });

export type EmailProvider = z.infer<typeof EmailProviderSchema>;
export type EmailPurpose = z.infer<typeof EmailPurposeSchema>;
export type EmailConnectionCreate = z.infer<typeof EmailConnectionCreateSchema>;
export type EmailConnection = z.infer<typeof EmailConnectionSchema>;
export type EmailRoute = z.infer<typeof EmailRouteSchema>;
export type EmailDelivery = z.infer<typeof EmailDeliverySchema>;
export type EmailAttempt = z.infer<typeof EmailAttemptSchema>;
export type SafeEmailDelivery = z.infer<typeof SafeEmailDeliverySchema>;
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
export type DeliveryListQuery = z.infer<typeof DeliveryListQuerySchema>;
export type EmailQueueMessage = z.infer<typeof EmailQueueMessageSchema>;
export type EmailErrorClass = z.infer<typeof EmailErrorClassSchema>;
