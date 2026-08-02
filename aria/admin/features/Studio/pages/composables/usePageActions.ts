import { ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import { enqueuePageThumbnailGeneration } from "@/features/Studio/pages/composables/pageThumbnailBackgroundQueue";
import { consumeStalePageThumbnailIds } from "@/features/Studio/pages/composables/pageThumbnailInvalidation";
import { resolvePagePreviewStage } from "@/features/Studio/pages/composables/resolvePagePreviewStage";
import { isThumbnailCaptureSupported } from "@/features/Studio/pages/utils/deviceCapabilities";
import { PageDSLSchema } from "../../../../../lib/schemas/nodes";
import type { Page } from "@/composables/useBuilderData";
import { prefetchPageResource } from "./usePageResourceBank";

export interface UsePageActionsReturn {
  duplicatePage: (slug: string) => Promise<string | null>;
  archivePage: (slug: string) => Promise<boolean>;
  unarchivePage: (slug: string) => Promise<boolean>;
  togglePublish: (page: Page) => Promise<void>;
  regenerateThumbnail: (
    slug: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  renamePage: (slug: string, title: string) => Promise<boolean>;
  prefetchPage: (slug: string) => void;
  /** Check if a thumbnail regeneration is currently in-flight for this page. */
  isPageThumbnailPending: (pageId: string) => boolean;
  /** Get the current cache-busting token for a page's thumbnail. */
  getPageThumbnailRefreshToken: (pageId: string) => string | null;
  /** Regenerate thumbnails for pages marked stale after a save. */
  refreshStalePageThumbnails: () => Promise<void>;
}

export function usePageActions(): UsePageActionsReturn {
  const { pages, refreshPagesNow } = useBuilderData();
  const v1Actions = useStudioActions();

  const thumbnailPendingPageIds = ref<Set<string>>(new Set());
  const thumbnailRefreshTokens = ref<Map<string, string>>(new Map());

  function setPageThumbnailPending(pageId: string, pending: boolean): void {
    const next = new Set(thumbnailPendingPageIds.value);
    if (pending) {
      next.add(pageId);
    } else {
      next.delete(pageId);
    }
    thumbnailPendingPageIds.value = next;
  }

  function isPageThumbnailPending(pageId: string): boolean {
    return thumbnailPendingPageIds.value.has(pageId);
  }

  function getPageThumbnailRefreshToken(pageId: string): string | null {
    return thumbnailRefreshTokens.value.get(pageId) ?? null;
  }

  async function duplicatePage(slug: string): Promise<string | null> {
    const result = await v1Actions.duplicatePage(slug);
    return result;
  }

  async function archivePage(slug: string): Promise<boolean> {
    try {
      const result = await actions.publishing.archive({ id: slug, slug });
      if (result.error) throw new Error(result.error.message);
      await refreshPagesNow();
      toast.success("Page archived");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
      return false;
    }
  }

  async function unarchivePage(slug: string): Promise<boolean> {
    try {
      const result = await actions.publishing.unarchive({ id: slug, slug });
      if (result.error) throw new Error(result.error.message);
      await refreshPagesNow();
      toast.success("Page restored");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
      return false;
    }
  }

  async function togglePublish(page: Page): Promise<void> {
    if (page.status === "published" && !page.isModifiedSincePublish) {
      const result = await actions.publishing.unpublish({
        id: page.id,
        slug: page.slug,
      });
      if (result.error) throw new Error(result.error.message);
      await refreshPagesNow();
      toast.success("Set as draft");
    } else {
      const { data } = await actions.getItem({
        collection: "pages",
        slug: page.slug,
      });
      if (!data) throw new Error("Failed to load page data for publish");
      const parsed = PageDSLSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error("Failed to load page data for publish");
      }
      const full = parsed.data;
      if (!full.version) {
        throw new Error("Page has no saved revision to publish");
      }
      const publishResult = await actions.publishing.publish({
        id: page.id,
        expectedVersion: full.version,
      });
      if (publishResult.error) {
        throw new Error(publishResult.error.message);
      }
      const publishBody = publishResult.data as
        | { success?: boolean; error?: { message?: string } }
        | undefined;
      if (!publishBody || publishBody.success !== true) {
        throw new Error(
          publishBody?.error?.message || "Failed to publish page",
        );
      }
      await refreshPagesNow();
      toast.success("Page published");
    }
  }

  async function regenerateThumbnail(
    slug: string,
    options: { silent?: boolean } = {},
  ): Promise<void> {
    const page = pages.value.find((p) => p.slug === slug);
    if (!page) {
      if (!options.silent) {
        toast.error("Page not found");
      }
      return;
    }

    // Guard against duplicate in-flight requests for the same page
    if (isPageThumbnailPending(page.id)) {
      return;
    }

    setPageThumbnailPending(page.id, true);

    try {
      const previewStage = resolvePagePreviewStage(page);
      if (!isThumbnailCaptureSupported()) {
        if (!options.silent) {
          toast.error("Thumbnail regeneration is not supported on this device");
        }
        return;
      }

      const thumbnailUrl = await enqueuePageThumbnailGeneration({
        pageId: page.id,
        pageSlug: page.slug,
        stage: previewStage,
        force: true,
      });

      if (thumbnailUrl) {
        await refreshPagesNow();
        const next = new Map(thumbnailRefreshTokens.value);
        next.set(page.id, String(Date.now()));
        thumbnailRefreshTokens.value = next;
        if (!options.silent) {
          toast.success("Thumbnail regenerated");
        }
      } else if (!options.silent) {
        toast.error("Thumbnail regeneration failed");
      }
    } catch (err) {
      if (!options.silent) {
        toast.error(
          err instanceof Error ? err.message : "Failed to regenerate thumbnail",
        );
      }
    } finally {
      setPageThumbnailPending(page.id, false);
    }
  }

  async function renamePage(slug: string, title: string): Promise<boolean> {
    try {
      const { data, error } = await actions.getItem({
        collection: "pages",
        slug,
      });
      if (error || !data)
        throw new Error(error?.message || "Failed to load page");
      const full = data as Record<string, unknown>;
      const expectedVersion = full.version;
      if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
        throw new Error("Reload this page before renaming it");
      }
      full.title = title;
      const result = await actions.updateItem({
        collection: "pages",
        slug,
        data: full,
        expectedVersion,
      });
      if (result.error) throw new Error(result.error.message);
      await refreshPagesNow();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
      return false;
    }
  }

  async function refreshStalePageThumbnails(): Promise<void> {
    const stalePageIds = consumeStalePageThumbnailIds();
    if (stalePageIds.length === 0 || !isThumbnailCaptureSupported()) {
      return;
    }

    await Promise.all(
      stalePageIds.map(async (pageId) => {
        const page = pages.value.find((entry) => entry.id === pageId);
        if (!page || isPageThumbnailPending(page.id)) {
          return;
        }

        await regenerateThumbnail(page.slug, { silent: true });
      }),
    );
  }

  function prefetchPage(slug: string): void {
    const scheduleIdle =
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : null;

    if (scheduleIdle) {
      scheduleIdle(
        () => {
          void prefetchPageResource(slug, "hover");
        },
        { timeout: 2000 },
      );
      return;
    }

    setTimeout(() => {
      void prefetchPageResource(slug, "hover");
    }, 100);
  }

  return {
    duplicatePage,
    archivePage,
    unarchivePage,
    togglePublish,
    regenerateThumbnail,
    renamePage,
    prefetchPage,
    isPageThumbnailPending,
    getPageThumbnailRefreshToken,
    refreshStalePageThumbnails,
  };
}
