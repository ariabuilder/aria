import { z } from "zod";

export const DOM_ID_ERROR_MESSAGE =
  "Use letters, numbers, dashes, or underscores. Start with a letter.";

export const DomIdSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, {
      message: DOM_ID_ERROR_MESSAGE,
    }),
]);

export function normalizeDomId(value: string): string {
  return value.trim().replace(/^#+/, "");
}

export function validateDomId(value: string): {
  valid: boolean;
  id: string;
  error: string | null;
} {
  const normalized = normalizeDomId(value);
  if (!normalized) {
    return { valid: true, id: "", error: null };
  }

  const parsed = DomIdSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      valid: false,
      id: normalized,
      error: parsed.error.issues[0]?.message ?? DOM_ID_ERROR_MESSAGE,
    };
  }

  return { valid: true, id: normalized, error: null };
}
