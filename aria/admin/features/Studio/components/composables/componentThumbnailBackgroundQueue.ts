import { ref } from "vue";

import {
  ensureComponentThumbnail,
  regenerateComponentThumbnail,
} from "./componentThumbnailGenerator";
import { clearComponentThumbnailStale } from "./componentThumbnailInvalidation";

type ComponentThumbnailJob = {
  componentId: string;
  force?: boolean;
};

const pendingIds = new Set<string>();
const requestedIds = new Set<string>();
const queuedJobs: ComponentThumbnailJob[] = [];
const generationPromises = new Map<string, Promise<string | null>>();
const generationResolvers = new Map<string, (thumbnailUrl: string | null) => void>();
let isProcessing = false;

/** Bumped when a component thumbnail finishes generating. */
export const componentThumbnailGenerationEpoch = ref<Record<string, number>>({});

/** Latest generated thumbnail URL per component (cache-busted for img reload). */
export const componentGeneratedThumbnailUrls = ref<Record<string, string>>({});

function withThumbnailCacheBust(thumbnailUrl: string): string {
  const parsed = new URL(thumbnailUrl, "http://localhost");
  parsed.searchParams.set("cv", String(Date.now()));
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeThumbnailUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getComponentGeneratedThumbnailUrl(
  componentId: string,
): string {
  return componentGeneratedThumbnailUrls.value[componentId.trim()] ?? "";
}

export function isComponentThumbnailQueued(componentId: string): boolean {
  const normalized = componentId.trim();
  return pendingIds.has(normalized) || requestedIds.has(normalized);
}

function notifyThumbnailReady(componentId: string, thumbnailUrl: string): void {
  const normalized = componentId.trim();
  componentGeneratedThumbnailUrls.value = {
    ...componentGeneratedThumbnailUrls.value,
    [normalized]: withThumbnailCacheBust(thumbnailUrl),
  };
  componentThumbnailGenerationEpoch.value = {
    ...componentThumbnailGenerationEpoch.value,
    [normalized]:
      (componentThumbnailGenerationEpoch.value[normalized] ?? 0) + 1,
  };
}

export function enqueueComponentThumbnailGeneration(
  componentId: string,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const normalized = componentId.trim();
  if (!normalized) {
    return Promise.resolve(null);
  }

  if (options.force) {
    requestedIds.delete(normalized);
    if (!pendingIds.has(normalized)) {
      generationPromises.delete(normalized);
    }
  }

  if (requestedIds.has(normalized) || pendingIds.has(normalized)) {
    return generationPromises.get(normalized) ?? Promise.resolve(null);
  }

  const generationPromise = new Promise<string | null>((resolve) => {
    generationResolvers.set(normalized, resolve);
  });
  generationPromises.set(normalized, generationPromise);
  requestedIds.add(normalized);
  pendingIds.add(normalized);
  queuedJobs.push({ componentId: normalized, force: options.force });
  void processComponentThumbnailQueue().catch(() => undefined);
  return generationPromise;
}

async function processComponentThumbnailQueue(): Promise<void> {
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

      const { componentId } = job;
      let thumbnailUrl: string | null = null;

      try {
        thumbnailUrl = normalizeThumbnailUrl(
          job.force
            ? await regenerateComponentThumbnail({ componentId })
            : await ensureComponentThumbnail({ componentId }),
        );
        if (thumbnailUrl) {
          clearComponentThumbnailStale(componentId);
          notifyThumbnailReady(componentId, thumbnailUrl);
        }
      } catch (error) {
        console.error("[componentThumbnailBackgroundQueue] Generation failed", {
          componentId,
          error,
        });
      } finally {
        pendingIds.delete(componentId);
        generationResolvers.get(componentId)?.(thumbnailUrl);
        generationResolvers.delete(componentId);
        if (!thumbnailUrl) {
          requestedIds.delete(componentId);
          generationPromises.delete(componentId);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

/** Test-only reset */
export function resetComponentThumbnailBackgroundQueue(): void {
  pendingIds.clear();
  requestedIds.clear();
  queuedJobs.length = 0;
  for (const resolve of generationResolvers.values()) {
    resolve(null);
  }
  generationPromises.clear();
  generationResolvers.clear();
  isProcessing = false;
  componentThumbnailGenerationEpoch.value = {};
  componentGeneratedThumbnailUrls.value = {};
}
