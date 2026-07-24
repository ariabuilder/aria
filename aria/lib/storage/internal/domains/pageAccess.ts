import type {
  CreateStoredPageAccessSessionInput,
  StorageAdapter,
  StoredPageAccessMode,
  StoredPageAccessSession,
  StoredPagePolicy,
  StoredPagePolicySummary,
  StoredPagePolicyUpdate,
  StoredPageSystemRole,
} from "../../adapter";
import {
  CreateStoredPageAccessSessionInputSchema,
  StoredPageAccessSessionSchema,
  StoredPagePolicySchema,
  StoredPagePolicySummarySchema,
  StoredPagePolicyUpdateSchema,
} from "../../adapter";
import { assertPageVersionDeletable } from "../../pageVersionDelete";
import { parseVersionAuthorshipRow } from "../../../authorship/reads";
import {
  parsePageVersionAuthorshipEntry,
  type PageVersionAuthorshipEntry,
} from "../../../authorship/schemas";
import { parseStoredActivityMetadata } from "../../../schemas/activity";
import { toStoredPagePolicy, toStoredPagePolicySummary } from "../../helpers";

export type PageAccessStorageDomain = Pick<
  StorageAdapter,
  | "getPagePolicy"
  | "getPagePolicyBySystemRole"
  | "savePagePolicy"
  | "listPagePolicySummaries"
  | "createPageAccessSession"
  | "getPageAccessSession"
  | "touchPageAccessSession"
  | "deletePageAccessSession"
  | "deletePageAccessSessionsForPage"
  | "getPageVersions"
  | "getPageVersionPins"
  | "deletePageVersion"
>;

type PageAccessStorageContext = {
  resolvePageIdentity(idOrSlug: string): Promise<any>;
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  nowIso(): string;
  getPagePolicy(idOrSlug: string): Promise<StoredPagePolicy | null>;
  getPageVersions(id: string): Promise<PageVersionAuthorshipEntry[]>;
};

function toStoredPageAccessSession(
  row: Record<string, unknown>,
): StoredPageAccessSession {
  return StoredPageAccessSessionSchema.parse({
    tokenHash: row.token_hash,
    pageId: row.page_id,
    policyVersion: row.policy_version,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  });
}

export function createPageAccessStorageDomain(
  context: PageAccessStorageContext,
): PageAccessStorageDomain {
  return {
    async getPagePolicy(idOrSlug: string): Promise<StoredPagePolicy | null> {
      const resolved = await context.resolvePageIdentity(idOrSlug);
      if (!resolved) {
        return null;
      }

      const row = await context.queryFirst<{
        id: string;
        slug: string | null;
        system_role: StoredPageSystemRole;
        access_mode: StoredPageAccessMode;
        access_password_hash: string | null;
        access_prompt_title: string | null;
        access_prompt_description: string | null;
        access_remember_for_days: number | null;
        access_policy_version: number;
        published_version: string | null;
        updated_at: string;
      }>(
        `SELECT id,
                slug,
                system_role,
                access_mode,
                access_password_hash,
                access_prompt_title,
                access_prompt_description,
                access_remember_for_days,
                access_policy_version,
                published_version,
                updated_at
         FROM aria_page_meta
         WHERE id = ?
         LIMIT 1`,
        [resolved.id],
      );

      return row ? toStoredPagePolicy(row, StoredPagePolicySchema) : null;
    },

    async getPagePolicyBySystemRole(
      systemRole: StoredPageSystemRole,
    ): Promise<StoredPagePolicy | null> {
      const row = await context.queryFirst<{
        id: string;
        slug: string | null;
        system_role: StoredPageSystemRole;
        access_mode: StoredPageAccessMode;
        access_password_hash: string | null;
        access_prompt_title: string | null;
        access_prompt_description: string | null;
        access_remember_for_days: number | null;
        access_policy_version: number;
        published_version: string | null;
        updated_at: string;
      }>(
        `SELECT id,
                slug,
                system_role,
                access_mode,
                access_password_hash,
                access_prompt_title,
                access_prompt_description,
                access_remember_for_days,
                access_policy_version,
                published_version,
                updated_at
         FROM aria_page_meta
         WHERE system_role = ?
         LIMIT 1`,
        [systemRole],
      );

      return row ? toStoredPagePolicy(row, StoredPagePolicySchema) : null;
    },

    async savePagePolicy(
      input: StoredPagePolicyUpdate,
    ): Promise<StoredPagePolicy | null> {
      const parsedInput = StoredPagePolicyUpdateSchema.parse(input);
      const resolved = await context.resolvePageIdentity(parsedInput.idOrSlug);
      if (!resolved) {
        return null;
      }

      await context.run(
        `UPDATE aria_page_meta
         SET system_role = ?,
             access_mode = ?,
             access_password_hash = ?,
             access_prompt_title = ?,
             access_prompt_description = ?,
             access_remember_for_days = ?,
             access_policy_version = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          parsedInput.systemRole,
          parsedInput.accessMode,
          parsedInput.accessPasswordHash,
          parsedInput.accessPromptTitle,
          parsedInput.accessPromptDescription,
          parsedInput.accessRememberForDays,
          parsedInput.accessPolicyVersion,
          parsedInput.updatedAt ?? context.nowIso(),
          resolved.id,
        ],
      );

      return context.getPagePolicy(resolved.id);
    },

    async listPagePolicySummaries(): Promise<StoredPagePolicySummary[]> {
      const rows = await context.queryAll<{
        id: string;
        slug: string | null;
        system_role: StoredPageSystemRole;
        access_mode: StoredPageAccessMode;
        access_password_hash: string | null;
      }>(
        `SELECT id, slug, system_role, access_mode, access_password_hash
         FROM aria_page_meta
         ORDER BY updated_at DESC`,
      );

      return rows.map((row) =>
        toStoredPagePolicySummary(row, StoredPagePolicySummarySchema),
      );
    },

    async createPageAccessSession(
      input: CreateStoredPageAccessSessionInput,
    ): Promise<StoredPageAccessSession> {
      const parsedInput = CreateStoredPageAccessSessionInputSchema.parse(input);
      const createdAt = parsedInput.createdAt ?? context.nowIso();
      const lastUsedAt = parsedInput.lastUsedAt ?? createdAt;

      await context.run(
        `INSERT INTO aria_page_access_sessions (token_hash, page_id, policy_version, expires_at, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(token_hash) DO UPDATE SET
           page_id = excluded.page_id,
           policy_version = excluded.policy_version,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at,
           last_used_at = excluded.last_used_at`,
        [
          parsedInput.tokenHash,
          parsedInput.pageId,
          parsedInput.policyVersion,
          parsedInput.expiresAt,
          createdAt,
          lastUsedAt,
        ],
      );

      return StoredPageAccessSessionSchema.parse({
        tokenHash: parsedInput.tokenHash,
        pageId: parsedInput.pageId,
        policyVersion: parsedInput.policyVersion,
        expiresAt: parsedInput.expiresAt,
        createdAt,
        lastUsedAt,
      });
    },

    async getPageAccessSession(
      pageId: string,
      tokenHash: string,
    ): Promise<StoredPageAccessSession | null> {
      const row = await context.queryFirst<{
        token_hash: string;
        page_id: string;
        policy_version: number;
        expires_at: string;
        created_at: string;
        last_used_at: string;
      }>(
        `SELECT token_hash, page_id, policy_version, expires_at, created_at, last_used_at
         FROM aria_page_access_sessions
         WHERE page_id = ? AND token_hash = ?
         LIMIT 1`,
        [pageId, tokenHash],
      );

      return row ? toStoredPageAccessSession(row) : null;
    },

    async touchPageAccessSession(
      tokenHash: string,
      lastUsedAt: string = context.nowIso(),
    ): Promise<void> {
      await context.run(
        `UPDATE aria_page_access_sessions
         SET last_used_at = ?
         WHERE token_hash = ?`,
        [lastUsedAt, tokenHash],
      );
    },

    async deletePageAccessSession(tokenHash: string): Promise<void> {
      await context.run(
        `DELETE FROM aria_page_access_sessions WHERE token_hash = ?`,
        [tokenHash],
      );
    },

    async deletePageAccessSessionsForPage(pageId: string): Promise<void> {
      await context.run(
        `DELETE FROM aria_page_access_sessions WHERE page_id = ?`,
        [pageId],
      );
    },

    async getPageVersions(id: string): Promise<PageVersionAuthorshipEntry[]> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return [];
      }

      const rows = await context.queryAll<{
        version: string;
        created_at: string;
        created_by_id: string | null;
        created_by_username: string | null;
        created_by_email: string | null;
        activity_metadata: string | null;
      }>(
        `SELECT version,
                created_at,
                created_by_id,
                created_by_username,
                created_by_email,
                activity_metadata
         FROM aria_page_versions
         WHERE id = ?
         ORDER BY version DESC`,
        [resolved.id],
      );

      return rows.map((row) => {
        const storedActivity = parseStoredActivityMetadata(
          row.activity_metadata,
        );
        return parsePageVersionAuthorshipEntry({
          version: String(row.version),
          createdAt: String(row.created_at),
          createdBy: parseVersionAuthorshipRow({
            version: String(row.version),
            created_at: String(row.created_at),
            created_by_id: row.created_by_id,
            created_by_username: row.created_by_username,
            created_by_email: row.created_by_email,
          }).createdBy,
          activity: storedActivity
            ? {
                action: storedActivity.action,
                userId: storedActivity.userId,
                userName: storedActivity.userName,
                target: storedActivity.target,
              }
            : null,
        });
      });
    },

    async getPageVersionPins(idOrSlug: string): Promise<{
      draftVersion: string | null;
      publishedVersion: string | null;
      currentVersion: string;
    } | null> {
      const resolved = await context.resolvePageIdentity(idOrSlug);
      if (!resolved) {
        return null;
      }

      return {
        draftVersion: resolved.draftVersion,
        publishedVersion: resolved.publishedVersion,
        currentVersion: resolved.currentVersion,
      };
    },

    async deletePageVersion(
      pageIdOrSlug: string,
      version: string,
    ): Promise<void> {
      const resolved = await context.resolvePageIdentity(pageIdOrSlug);
      if (!resolved) {
        throw new Error(`Page not found: ${pageIdOrSlug}`);
      }

      const versions = await context.getPageVersions(resolved.id);
      const normalizedVersion = assertPageVersionDeletable({
        version,
        pins: {
          draftVersion: resolved.draftVersion,
          publishedVersion: resolved.publishedVersion,
          currentVersion: resolved.currentVersion,
        },
        existingVersions: versions.map((entry) => entry.version),
      });

      await context.run(
        `DELETE FROM aria_page_versions WHERE id = ? AND version = ?`,
        [resolved.id, normalizedVersion],
      );
    },
  };
}
