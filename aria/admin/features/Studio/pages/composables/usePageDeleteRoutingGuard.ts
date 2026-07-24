import { ref } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { AriaCollectionSchema } from "../../../../../lib/cms/schemas";
import { ListCollectionsResponseSchema } from "../../../../../lib/cms/actionSchemas";
import {
  getPageCmsRoutingImpact,
  pageHasCmsRoutingAssignments,
  type PageCmsRoutingImpact,
} from "../../../../../lib/pages/cmsTemplatePolicy";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { unwrapStudioCrudGetItemResult } from "@/features/Studio/composer/composables/studioCrudActionResults";
import { buildPageDeleteRoutingUnbindPatches } from "../lib/pageDeleteRouting";

const RoutingGuardCollectionSchema = AriaCollectionSchema.pick({
  id: true,
  name: true,
  label: true,
  templatePageId: true,
  listPageId: true,
  updatedAt: true,
});

type RoutingGuardCollection = z.infer<typeof RoutingGuardCollectionSchema>;

export type PageDeleteCanonicalIdentity = {
  pageId: string;
  pageSlug: string;
};

export function usePageDeleteRoutingGuard() {
  const collections = ref<RoutingGuardCollection[]>([]);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  async function ensureCollections(): Promise<boolean> {
    if (collections.value.length > 0) {
      return true;
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      const result = await actions.cms.collections.list({});
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? "Failed to load collections");
      }

      const parsed = ListCollectionsResponseSchema.parse(result.data);
      collections.value = z
        .array(RoutingGuardCollectionSchema)
        .parse(parsed.collections);
      return true;
    } catch (error) {
      loadError.value =
        error instanceof Error ? error.message : "Failed to load collections";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function resolveCanonicalPageIdentity(
    slug: string,
    fallbackPageId?: string | null,
  ): Promise<PageDeleteCanonicalIdentity | null> {
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      return null;
    }

    const result = unwrapStudioCrudGetItemResult(
      "pages",
      await actions.getItem({
        collection: "pages",
        slug: trimmedSlug,
      }),
      "Failed to load page",
      {
        slug: trimmedSlug,
        source: "usePageDeleteRoutingGuard.resolveCanonicalPageIdentity",
      },
    );

    if (result.success) {
      return {
        pageId: result.data.id,
        pageSlug: result.data.slug?.trim() || trimmedSlug,
      };
    }

    const fallbackId = fallbackPageId?.trim();
    if (fallbackId) {
      return {
        pageId: fallbackId,
        pageSlug: trimmedSlug,
      };
    }

    return null;
  }

  function getRoutingImpact(
    identity: PageDeleteCanonicalIdentity,
  ): PageCmsRoutingImpact | null {
    const impact = getPageCmsRoutingImpact({
      pageId: identity.pageId,
      pageSlug: identity.pageSlug,
      collections: collections.value,
    });

    return pageHasCmsRoutingAssignments(impact) ? impact : null;
  }

  async function unbindPageFromCollections(
    impact: PageCmsRoutingImpact,
  ): Promise<void> {
    const patches = buildPageDeleteRoutingUnbindPatches(impact);

    for (const entry of patches) {
      const collection = collections.value.find(
        (candidate) => candidate.id === entry.collectionId,
      );
      if (!collection) {
        throw new Error("Collection not found while unbinding page routes.");
      }

      const result = await actions.cms.collections.update({
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: entry.patch,
      });

      if (result.error) {
        if (
          handleActionResultForbidden(
            { error: result.error },
            "cms.collections.update",
          )
        ) {
          throw new Error("You do not have permission to update collections.");
        }
        throw new Error(
          result.error.message ?? "Failed to unbind collection routes.",
        );
      }

      if (!result.data) {
        throw new Error("Failed to unbind collection routes.");
      }

      const updated = RoutingGuardCollectionSchema.parse(result.data);
      collections.value = collections.value.map((candidate) =>
        candidate.id === updated.id ? updated : candidate,
      );
    }
  }

  return {
    collections,
    isLoading,
    loadError,
    ensureCollections,
    resolveCanonicalPageIdentity,
    getRoutingImpact,
    unbindPageFromCollections,
  };
}
