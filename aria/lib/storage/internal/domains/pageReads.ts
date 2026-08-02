import type { StorageAdapter } from "../../adapter";
import {
  buildDeriveAssetAuthorshipInput,
  hydratePageDslAuthorship,
  parseLegacyDslAuthorshipFields,
  resolvePageAuthorship,
} from "../../../authorship/reads";
import { parseAssetAuthorship } from "../../../authorship/projections";
import type { AssetAuthorship } from "../../../auth/types";
import type { PageDSL } from "../../../types/nodes";
import type { ResolvedPageIdentity } from "./contextTypes";

export type PageReadStorageDomain = Pick<
  StorageAdapter,
  "getPageDSL" | "getPageAuthorship" | "getPublishedPageDSL"
>;

type PageReadStorageContext = {
  resolvePageIdentity(idOrSlug: string): Promise<ResolvedPageIdentity | null>;
  normalizeVersion(version?: string): string | undefined;
  loadPageVersion(id: string, version: string): Promise<PageDSL | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  getPageAuthorship(idOrSlug: string): Promise<AssetAuthorship | null>;
};

export function createPageReadStorageDomain(
  context: PageReadStorageContext,
): PageReadStorageDomain {
  return {
    async getPageDSL(id: string, version?: string): Promise<PageDSL | null> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return null;
      }

      const targetVersion =
        context.normalizeVersion(version) ??
        resolved.draftVersion ??
        resolved.publishedVersion ??
        resolved.currentVersion;

      const page = await context.loadPageVersion(resolved.id, targetVersion);
      if (page) {
        delete page._publicationDependencies;
        page.status = (resolved.status as PageDSL["status"]) ?? page.status;
        page.systemRole = resolved.systemRole ?? page.systemRole;
        page.accessMode = resolved.accessMode ?? page.accessMode;
        page.isModifiedSincePublish =
          typeof resolved.draftVersion === "string" &&
          typeof resolved.publishedVersion === "string" &&
          resolved.draftVersion !== resolved.publishedVersion;

        const authorship = await context.getPageAuthorship(resolved.id);
        if (authorship) {
          return hydratePageDslAuthorship(page, authorship);
        }
      }
      return page;
    },
    async getPageAuthorship(idOrSlug: string): Promise<AssetAuthorship | null> {
      const resolved = await context.resolvePageIdentity(idOrSlug);
      if (!resolved) {
        return null;
      }

      const versionRows = await context.queryAll<{
        version: string;
        created_at: string;
        created_by_id: string | null;
        created_by_username: string | null;
        created_by_email: string | null;
        created_by_avatar_url: string | null;
      }>(
        `SELECT version,
                created_at,
                created_by_id,
                created_by_username,
                created_by_email,
                created_by_avatar_url
         FROM aria_page_versions
         WHERE id = ?
         ORDER BY version ASC`,
        [resolved.id],
      );

      const deriveInput = buildDeriveAssetAuthorshipInput({
        currentVersion: resolved.currentVersion,
        draftVersion: resolved.draftVersion,
        publishedVersion: resolved.publishedVersion,
        versionRows,
      });

      const draftVersion =
        resolved.draftVersion ??
        resolved.currentVersion ??
        resolved.publishedVersion;
      let legacy = undefined;
      if (draftVersion) {
        const draftPage = await context.loadPageVersion(
          resolved.id,
          draftVersion,
        );
        if (draftPage) {
          legacy = parseLegacyDslAuthorshipFields(draftPage);
        }
      }

      const authorship = resolvePageAuthorship(deriveInput, legacy);
      return Object.keys(authorship).length === 0
        ? null
        : parseAssetAuthorship(authorship);
    },
    async getPublishedPageDSL(
      id: string,
      version?: string,
    ): Promise<PageDSL | null> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return null;
      }

      const targetVersion =
        context.normalizeVersion(version) ?? resolved.publishedVersion;
      return targetVersion
        ? context.loadPageVersion(resolved.id, targetVersion)
        : null;
    },
  };
}
