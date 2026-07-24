import { z } from "zod";
import {
  RedirectRuleSchema,
  type CreateRedirectInput,
  type RedirectRule,
  type UpdateRedirectInput,
} from "./schemas";

const RedirectRowSchema = z
  .object({
    id: z.string().min(1),
    from_path: z.string().min(1),
    to_path: z.string().min(1),
    status_code: z.union([z.literal(301), z.literal(302)]),
    enabled: z.union([z.literal(0), z.literal(1), z.boolean()]),
    note: z.string().nullable().optional(),
    created_at: z.string().min(1),
    created_by_id: z.string().nullable().optional(),
    updated_at: z.string().min(1),
  })
  .strict();

export function mapRedirectRow(row: unknown): RedirectRule {
  const parsed = RedirectRowSchema.parse(row);
  return RedirectRuleSchema.parse({
    id: parsed.id,
    fromPath: parsed.from_path,
    toPath: parsed.to_path,
    statusCode: parsed.status_code,
    enabled: parsed.enabled === 1 || parsed.enabled === true,
    note: parsed.note ?? undefined,
    createdAt: parsed.created_at,
    createdById: parsed.created_by_id ?? undefined,
    updatedAt: parsed.updated_at,
  });
}

export function normalizeRedirectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function buildRedirectUpdateFields(
  current: RedirectRule,
  input: UpdateRedirectInput,
): RedirectRule {
  return RedirectRuleSchema.parse({
    ...current,
    fromPath:
      input.fromPath !== undefined
        ? normalizeRedirectPath(input.fromPath)
        : current.fromPath,
    toPath:
      input.toPath !== undefined
        ? normalizeRedirectPath(input.toPath)
        : current.toPath,
    statusCode: input.statusCode ?? current.statusCode,
    enabled: input.enabled ?? current.enabled,
    note:
      input.note === null
        ? undefined
        : input.note !== undefined
          ? input.note
          : current.note,
    updatedAt: new Date().toISOString(),
  });
}

export function buildRedirectCreateFields(
  input: CreateRedirectInput,
  id: string,
  actorId?: string,
): RedirectRule {
  const now = new Date().toISOString();
  return RedirectRuleSchema.parse({
    id,
    fromPath: normalizeRedirectPath(input.fromPath),
    toPath: normalizeRedirectPath(input.toPath),
    statusCode: input.statusCode ?? 301,
    enabled: input.enabled ?? true,
    note: input.note,
    createdAt: now,
    createdById: actorId,
    updatedAt: now,
  });
}
