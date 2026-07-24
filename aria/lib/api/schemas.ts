import { z } from "zod";

export const SITE_API_AUDIENCE = "aria-site-api-v1" as const;

export const ApiScopeSchema = z.enum([
  "collections:read",
  "entries:read",
  "entries:write",
  "entries:publish",
]);
export type ApiScope = z.infer<typeof ApiScopeSchema>;

export const ApiCredentialKindSchema = z.enum(["personal", "service"]);
export type ApiCredentialKind = z.infer<typeof ApiCredentialKindSchema>;

export const ApiCredentialSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  kind: ApiCredentialKindSchema,
  principalId: z.uuid(),
  createdById: z.uuid().nullable(),
  audience: z.literal(SITE_API_AUDIENCE),
  name: z.string().trim().min(1).max(120),
  tokenPrefix: z.string().min(8).max(32),
  tokenDigest: z.string().min(32),
  keyId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u),
  scopes: z.array(ApiScopeSchema).min(1),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ApiCredential = z.infer<typeof ApiCredentialSchema>;

export const ApiCredentialPublicSchema = ApiCredentialSchema.omit({
  tokenDigest: true,
});
export type ApiCredentialPublic = z.infer<typeof ApiCredentialPublicSchema>;

export const CreateApiCredentialInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: ApiCredentialKindSchema.default("personal"),
    principalId: z.uuid().optional(),
    scopes: z.array(ApiScopeSchema).min(1),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type CreateApiCredentialInput = z.infer<
  typeof CreateApiCredentialInputSchema
>;

export const CreatedApiCredentialSchema = z.object({
  credential: ApiCredentialPublicSchema,
  token: z.string().min(32),
});
export type CreatedApiCredential = z.infer<typeof CreatedApiCredentialSchema>;

export const IdempotencyKeySchema = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[\x20-\x7E]+$/u, "Idempotency-Key must be printable ASCII");

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "precondition_required",
  "precondition_failed",
  "rate_limited",
  "internal_error",
  "service_unavailable",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export type ApiSuccessEnvelope<T> = { success: true; data: T };
export type ApiErrorEnvelope = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};
