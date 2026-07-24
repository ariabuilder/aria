import type { StorageAdapter } from "../../adapter";
import {
  buildRedirectCreateFields,
  buildRedirectUpdateFields,
  mapRedirectRow,
} from "../../../redirects/db";
import type {
  CreateRedirectInput,
  RedirectRule,
  UpdateRedirectInput,
} from "../../../redirects/schemas";

export type RedirectStorageDomain = Pick<
  StorageAdapter,
  | "listRedirects"
  | "getRedirectById"
  | "createRedirect"
  | "updateRedirect"
  | "deleteRedirect"
  | "appendSettingsAuditEntry"
>;

type RedirectStorageContext = {
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  createId(): string;
  now(): string;
};

export function createRedirectStorageDomain(
  context: RedirectStorageContext,
): RedirectStorageDomain {
  const getRedirectById = async (id: string): Promise<RedirectRule | null> => {
    const row = await context.queryFirst<Record<string, unknown>>(
      `SELECT * FROM aria_redirects WHERE id = ? LIMIT 1`,
      [id],
    );
    return row ? mapRedirectRow(row) : null;
  };

  return {
    async listRedirects(options) {
      const sql = options?.includeDisabled
        ? `SELECT * FROM aria_redirects ORDER BY created_at DESC`
        : `SELECT * FROM aria_redirects WHERE enabled = 1 ORDER BY created_at DESC`;
      return (await context.queryAll<Record<string, unknown>>(sql)).map((row) =>
        mapRedirectRow(row),
      );
    },
    getRedirectById,
    async createRedirect(input: CreateRedirectInput, actorId?: string) {
      const rule = buildRedirectCreateFields(
        input,
        context.createId(),
        actorId,
      );
      await context.run(
        `INSERT INTO aria_redirects (
          id, from_path, to_path, status_code, enabled, note, created_at, created_by_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rule.id,
          rule.fromPath,
          rule.toPath,
          rule.statusCode,
          rule.enabled ? 1 : 0,
          rule.note ?? null,
          rule.createdAt,
          rule.createdById ?? null,
          rule.updatedAt,
        ],
      );
      return rule;
    },
    async updateRedirect(input: UpdateRedirectInput) {
      const current = await getRedirectById(input.id);
      if (!current) {
        throw new Error(`Redirect not found: ${input.id}`);
      }
      const next = buildRedirectUpdateFields(current, input);
      await context.run(
        `UPDATE aria_redirects
         SET from_path = ?, to_path = ?, status_code = ?, enabled = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.fromPath,
          next.toPath,
          next.statusCode,
          next.enabled ? 1 : 0,
          next.note ?? null,
          next.updatedAt,
          next.id,
        ],
      );
      return next;
    },
    deleteRedirect: (id) =>
      context.run(`DELETE FROM aria_redirects WHERE id = ?`, [id]),
    appendSettingsAuditEntry: (entry) =>
      context.run(
        `INSERT INTO aria_settings_audit (
          id, category, action, actor_id, actor_username, summary, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          context.createId(),
          entry.category,
          entry.action,
          entry.actorId,
          entry.actorUsername ?? null,
          entry.summary,
          entry.payload ? JSON.stringify(entry.payload) : null,
          context.now(),
        ],
      ),
  };
}
