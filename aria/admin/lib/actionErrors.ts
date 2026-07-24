/**
 * Astro action error helpers for capability-denied responses.
 */

import { z } from "zod";
import { toast } from "vue-sonner";
import {
  OperationIdSchema,
  type OperationId,
} from "../../lib/auth/capabilityOperations";
import { getForbiddenMessageForOperation } from "../composables/useCapabilities";

export const ActionErrorCodeSchema = z.enum([
  "FORBIDDEN",
  "UNAUTHORIZED",
  "BAD_REQUEST",
  "NOT_FOUND",
  "INTERNAL_SERVER_ERROR",
]);

export type ActionErrorCode = z.infer<typeof ActionErrorCodeSchema>;

export const AstroActionErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
});

export type AstroActionError = z.infer<typeof AstroActionErrorSchema>;

export function parseAstroActionError(error: unknown): AstroActionError | null {
  const parsed = AstroActionErrorSchema.safeParse(error);
  return parsed.success ? parsed.data : null;
}

export function isForbiddenActionError(error: unknown): boolean {
  const parsed = parseAstroActionError(error);
  if (!parsed) return false;
  return ActionErrorCodeSchema.safeParse(parsed.code).success
    ? parsed.code === "FORBIDDEN"
    : parsed.code === "FORBIDDEN";
}

/**
 * Show capability copy when an action returns FORBIDDEN.
 * @returns true when the error was FORBIDDEN and a toast was shown
 */
export function handleActionForbidden(
  error: unknown,
  operationId: OperationId,
): boolean {
  if (!isForbiddenActionError(error)) {
    return false;
  }
  const parsedOperation = OperationIdSchema.parse(operationId);
  toast.error(getForbiddenMessageForOperation(parsedOperation));
  return true;
}

/**
 * Handle `{ error }` shapes returned by astro:actions calls.
 */
export function handleActionResultForbidden(
  result: { error?: unknown },
  operationId: OperationId,
): boolean {
  if (!result.error) return false;
  return handleActionForbidden(result.error, operationId);
}
