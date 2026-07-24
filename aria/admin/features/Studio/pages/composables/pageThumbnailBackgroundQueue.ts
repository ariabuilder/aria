import { ref } from "vue";

import type { PageSnapshotStage } from "@/lib/rendering/pageSnapshots";
import {
  ensurePageThumbnail,
  regeneratePageThumbnail,
} from "./pageThumbnailGenerator";
import { clearPageThumbnailStale } from "./pageThumbnailInvalidation";
import { isThumbnailCaptureSupported } from "../utils/deviceCapabilities";

type PageThumbnailJob = {
  pageId: string;
  pageSlug: string;
  stage: PageSnapshotStage;
  force?: boolean;
};

function jobKey(input: Pick<PageThumbnailJob, "pageId" | "stage">): string {
  return `${input.pageId.trim()}:${input.stage}`;
}

const pendingKeys = new Set<string>();
const requestedKeys = new Set<string>();
const queuedJobs: PageThumbnailJob[] = [];
const generationPromises = new Map<string, Promise<string | null>>();
const generationResolvers = new Map<string, (thumbnailUrl: string | null) => void>();
let isProcessing = false;

/** Bumped when a page thumbnail finishes generating. */
export const pageThumbnailGenerationEpoch = ref<Record<string, number>>({});

/** Latest generated thumbnail URL per page (cache-busted for img reload). */
export const pageGeneratedThumbnailUrls = ref<Record<string, string>>({});

function withThumbnailCacheBust(thumbnailUrl: string): string {
  const parsed = new URL(thumbnailUrl, "http://localhost");
  parsed.searchParams.set("cv", String(Date.now()));
  return `${parsed.pathname}${parsed.search}`;
}

function notifyThumbnailReady(pageId: string, thumbnailUrl: string): void {
  const normalized = pageId.trim();
  pageGeneratedThumbnailUrls.value = {
    ...pageGeneratedThumbnailUrls.value,
    [normalized]: withThumbnailCacheBust(thumbnailUrl),
  };
  pageThumbnailGenerationEpoch.value = {
    ...pageThumbnailGenerationEpoch.value,
    [normalized]:
      (pageThumbnailGenerationEpoch.value[normalized] ?? 0) + 1,
  };
}

export function getPageGeneratedThumbnailUrl(pageId: string): string {
  return pageGeneratedThumbnailUrls.value[pageId.trim()] ?? "";
}

export function clearPageThumbnailJobRequest(input: {
  pageId: string;
  stage: PageSnapshotStage;
}): void {
  requestedKeys.delete(jobKey(input));
}

export function enqueuePageThumbnailGeneration(
  input: PageThumbnailJob,
): Promise<string | null> {
  const normalizedPageId = input.pageId.trim();
  const normalizedPageSlug = input.pageSlug.trim();
  if (!normalizedPageId || !normalizedPageSlug) {
    return Promise.resolve(null);
  }

  if (!isThumbnailCaptureSupported()) {
    return Promise.resolve(null);
  }

  const key = jobKey(input);

  if (input.force) {
    requestedKeys.delete(key);
    if (!pendingKeys.has(key)) {
      generationPromises.delete(key);
    }
  }

  if (requestedKeys.has(key) || pendingKeys.has(key)) {
    return generationPromises.get(key) ?? Promise.resolve(null);
  }

  const generationPromise = new Promise<string | null>((resolve) => {
    generationResolvers.set(key, resolve);
  });
  generationPromises.set(key, generationPromise);
  requestedKeys.add(key);
  pendingKeys.add(key);
  queuedJobs.push({
    pageId: normalizedPageId,
    pageSlug: normalizedPageSlug,
    stage: input.stage,
    force: input.force,
  });
  void processPageThumbnailQueue().catch(() => undefined);
  return generationPromise;
}

async function processPageThumbnailQueue(): Promise<void> {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    while (queuedJobs.length > 0) {
      const job = queuedJobs.shift();
      if (!job) {
        continue;
      }

      const key = jobKey(job);
      let thumbnailUrl: string | null = null;

      try {
        thumbnailUrl = job.force
          ? await regeneratePageThumbnail({
              pageId: job.pageId,
              pageSlug: job.pageSlug,
              stage: job.stage,
            })
          : await ensurePageThumbnail({
              pageId: job.pageId,
              pageSlug: job.pageSlug,
              stage: job.stage,
            });

        if (thumbnailUrl) {
          clearPageThumbnailStale(job.pageId);
          notifyThumbnailReady(job.pageId, thumbnailUrl);
        }
      } catch (error) {
        console.error("[pageThumbnailBackgroundQueue] Generation failed", {
          pageId: job.pageId,
          pageSlug: job.pageSlug,
          stage: job.stage,
          error,
        });
      } finally {
        pendingKeys.delete(key);
        generationResolvers.get(key)?.(thumbnailUrl);
        generationResolvers.delete(key);
        if (!thumbnailUrl) {
          requestedKeys.delete(key);
          generationPromises.delete(key);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

/** Test-only reset */
export function resetPageThumbnailBackgroundQueue(): void {
  pendingKeys.clear();
  requestedKeys.clear();
  queuedJobs.length = 0;
  for (const resolve of generationResolvers.values()) {
    resolve(null);
  }
  generationPromises.clear();
  generationResolvers.clear();
  isProcessing = false;
  pageThumbnailGenerationEpoch.value = {};
  pageGeneratedThumbnailUrls.value = {};
}
