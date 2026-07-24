import type { AuthorshipSaveContext, StorageAdapter } from "../../adapter";
import {
  appendSqlFragment,
  buildSingletonUpsertAuthorshipAssignments,
  parseOptionalAuthorshipSaveContext,
} from "../../../authorship/stamping";
import { JsonObjectSchema } from "../../../schemas/json";
import type { JsonObject } from "../../../types/nodes";

export type PageMetadataStorageDomain = Pick<
  StorageAdapter,
  "getPageMetadata" | "savePageMetadata"
>;

type PageMetadataStorageContext = {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  now(): string;
  bindArgs(args: readonly unknown[]): readonly unknown[];
};

export function createPageMetadataStorageDomain(
  context: PageMetadataStorageContext,
): PageMetadataStorageDomain {
  return {
    async getPageMetadata(slug: string): Promise<JsonObject | null> {
      const row = await context.queryFirst<{ metadata_json: string }>(
        `SELECT metadata_json FROM aria_page_metadata WHERE slug = ? LIMIT 1`,
        [slug],
      );
      if (!row) {
        return null;
      }
      try {
        const parsed = JsonObjectSchema.safeParse(
          JSON.parse(String(row.metadata_json)),
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async savePageMetadata(
      slug: string,
      meta: JsonObject,
      authorship?: AuthorshipSaveContext,
    ): Promise<void> {
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const updatedAt = context.now();
      const insertAuthorship = buildSingletonUpsertAuthorshipAssignments(
        "insert",
        parsedAuthorship,
      );
      const updateAuthorship = buildSingletonUpsertAuthorshipAssignments(
        "update",
        parsedAuthorship,
      );
      const insertPayload = appendSqlFragment(
        ["slug", "metadata_json", "updated_at"],
        [slug, JSON.stringify(meta), updatedAt],
        insertAuthorship,
      );
      const updateSets = [
        "metadata_json = excluded.metadata_json",
        "updated_at = excluded.updated_at",
        ...updateAuthorship.columnNames.map(
          (column) => `${column} = excluded.${column}`,
        ),
      ];
      await context.run(
        `INSERT INTO aria_page_metadata (${insertPayload.columns.join(", ")})
         VALUES (${insertPayload.columns.map(() => "?").join(", ")})
         ON CONFLICT(slug) DO UPDATE SET
           ${updateSets.join(", ")}`,
        context.bindArgs(insertPayload.values),
      );
    },
  };
}
