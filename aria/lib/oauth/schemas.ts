import { z } from "zod";

export const FigmaOAuthScopeSchema = z.enum([
  "figma:context:read",
  "figma:assets:write",
  "figma:imports:write",
]);
export type FigmaOAuthScope = z.infer<typeof FigmaOAuthScopeSchema>;

export const FIGMA_OAUTH_SCOPES = FigmaOAuthScopeSchema.options;

export const DeviceAuthorizationInputSchema = z
  .object({
    client_id: z.literal("aria-figma-plugin"),
    scope: z.string().trim().min(1).max(240),
  })
  .strict();

export const DeviceTokenInputSchema = z
  .object({
    grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code"),
    device_code: z.string().min(40).max(160),
    client_id: z.literal("aria-figma-plugin"),
  })
  .strict();

export const RefreshTokenInputSchema = z
  .object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(40).max(160),
    client_id: z.literal("aria-figma-plugin"),
  })
  .strict();

export const RevokeTokenInputSchema = z
  .object({
    token: z.string().min(40).max(160),
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
    client_id: z.literal("aria-figma-plugin"),
  })
  .strict();

export function parseFigmaScopeString(value: string): FigmaOAuthScope[] {
  const scopes = [...new Set(value.split(/\s+/u).filter(Boolean))];
  return z.array(FigmaOAuthScopeSchema).min(1).max(3).parse(scopes).sort();
}

export function normalizeUserCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
}
