import { z } from "zod";
import {
  DiscoveryArtifactsSchema,
  DiscoveryGeneratedBaselineSchema,
  DiscoveryReportSchema,
} from "../../lib/crawl/schemas";
import {
  ListRedirectsResponseSchema,
  RedirectRuleSchema,
} from "../../lib/redirects/schemas";

export function parseDiscoveryReportPayload(data: unknown) {
  return DiscoveryReportSchema.parse(data);
}

export function parseDiscoveryArtifactsPayload(data: unknown) {
  return DiscoveryArtifactsSchema.parse(data);
}

export function parseDiscoveryGeneratedBaselinePayload(data: unknown) {
  return DiscoveryGeneratedBaselineSchema.parse(data);
}

export function parseRedirectListPayload(data: unknown) {
  return ListRedirectsResponseSchema.parse(data);
}

export function parseRedirectRulePayload(data: unknown) {
  return RedirectRuleSchema.parse(data);
}

export const DiscoveryActionSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

export const DiscoveryActionErrorSchema = z.object({
  success: z.literal(false).optional(),
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});
