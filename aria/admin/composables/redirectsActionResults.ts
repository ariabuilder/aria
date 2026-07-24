import { z } from "zod";
import {
  ImportRedirectsCsvResponseSchema,
  ListRedirectTargetsResponseSchema,
  ListRedirectsResponseSchema,
  RedirectRuleSchema,
} from "../../lib/redirects/schemas";

export function parseRedirectListPayload(data: unknown) {
  return ListRedirectsResponseSchema.parse(data);
}

export function parseRedirectTargetsPayload(data: unknown) {
  return ListRedirectTargetsResponseSchema.parse(data);
}

export function parseRedirectRulePayload(data: unknown) {
  return RedirectRuleSchema.parse(data);
}

export function parseImportRedirectsCsvPayload(data: unknown) {
  return ImportRedirectsCsvResponseSchema.parse(data);
}

export const RedirectDeleteSuccessSchema = z.object({
  success: z.literal(true),
});
