import { defineAction } from "astro:actions";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  SearchCmsRequestSchema,
  SearchCmsResponseSchema,
} from "../../lib/cms/actionSchemas";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import {
  getContentLocaleSettings,
  getEntryFromAdapter,
} from "../../lib/cms/services/entries";
import {
  ensureCmsSearchIndex,
  searchCanonicalCmsDocuments,
} from "../../lib/cms/services/search";
import { resolveContentLocaleChain } from "../../lib/localization/contentLocale";
import { requireOperation } from "../_shared";
import type { SessionUser } from "../../lib/auth/types";
import type { CmsSearchResult } from "../../lib/cms/schemas";
import type { StorageAdapter } from "../../lib/storage/adapter";
import {
  recordCmsAudit,
  requireCmsCollectionPolicy,
  resolveCmsPolicyLocale,
} from "./accessPolicy";

async function authorizeSearchCandidates(
  adapter: StorageAdapter,
  user: SessionUser,
  requestedLocale: string,
  candidates: readonly CmsSearchResult[],
  limit: number,
): Promise<CmsSearchResult[]> {
  const results: CmsSearchResult[] = [];
  for (const candidate of candidates) {
    if (candidate.entityType === "collection") {
      try {
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: candidate.entityId,
          action: "read",
          locale: requestedLocale,
          allowDenied: true,
        });
        if (decision.allowed) results.push(candidate);
      } catch {
        // A collection deleted after indexing intentionally produces no signal.
      }
    } else if (candidate.collectionId) {
      try {
        const record = await getEntryFromAdapter(adapter, {
          collectionId: candidate.collectionId,
          idOrSlug: candidate.entityId,
          locale: candidate.locale,
        });
        const locale = await resolveCmsPolicyLocale(
          adapter,
          record,
          candidate.locale,
        );
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: candidate.collectionId,
          action: "read",
          locale,
          entry: record,
          allowDenied: true,
        });
        if (
          decision.allowed &&
          (!decision.visibleFields ||
            (decision.visibleFields.has("title") &&
              decision.visibleFields.has("slug")))
        ) {
          results.push(candidate);
        }
      } catch {
        // Deleted or unavailable entries intentionally produce no signal.
      }
    }
    if (results.length >= limit) break;
  }
  return results;
}

export const search = defineAction({
  accept: "json",
  input: SearchCmsRequestSchema,
  handler: async (input, context) => {
    const user = await requireOperation(context, "cms.entries.query");
    const adapter = await getStorageAdapterAsync(context.locals);
    try {
      const settings = await getContentLocaleSettings(adapter);
      const requestedLocale = input.locale ?? settings.defaultLocale;
      const locales = [
        ...resolveContentLocaleChain(settings, requestedLocale),
        "global",
      ];
      const limit = input.limit ?? 20;
      const candidateLimit = Math.min(limit * 8, 200);
      const index = await ensureCmsSearchIndex(adapter);
      if (index.repairAttempted) {
        try {
          await recordCmsAudit(adapter, {
            actor: user,
            action: index.ready ? "search.repaired" : "search.repair_deferred",
            summary: index.ready
              ? "Repaired CMS search index automatically"
              : "Deferred CMS search repair and used canonical search",
            metadata: { failedCollectionIds: index.failedCollectionIds },
          });
        } catch (error) {
          console.error("CMS search repair audit could not be recorded", error);
        }
      }
      const candidates = index.ready
        ? await adapter.searchCmsSearchDocuments({
            query: input.query,
            locales,
            limit: candidateLimit,
          })
        : await searchCanonicalCmsDocuments(adapter, {
            query: input.query,
            locales,
            limit: candidateLimit,
          });
      const results = await authorizeSearchCandidates(
        adapter,
        user,
        requestedLocale,
        candidates,
        limit,
      );

      return SearchCmsResponseSchema.parse({
        results: results.map((result) => ({
          entityType: result.entityType,
          entityId: result.entityId,
          collectionId: result.collectionId,
          locale: result.locale,
          title: result.title,
          slug: result.slug,
          collectionName: result.collectionName,
          collectionLabel: result.collectionLabel,
          status: result.status,
          updatedAt: result.updatedAt,
          rank: result.rank,
        })),
      });
    } catch (error) {
      rethrowCmsError(error);
    }
  },
});
