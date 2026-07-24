import { isIOS } from "../utils/deviceCapabilities";

interface SnapshotCacheEntry {
  url: string;
  html: string;
  cachedAt: number;
  size: number;
}

type SnapshotCacheSource = "memory" | "network" | "shared";

interface LoadSnapshotHtmlResult {
  html: string;
  source: SnapshotCacheSource;
}

const STORAGE_KEY = "aria.page-preview.snapshot-cache.v1";
const MAX_ENTRIES = 24;
const MAX_TOTAL_SIZE = 3_000_000;

/**
 * On iOS/iPadOS, limit to 1 concurrent snapshot fetch. The srcdoc iframe
 * path is suppressed on iOS (see PagePreviewFrame), but the cache is.
 */
const MAX_CONCURRENT_FETCHES = isIOS() ? 1 : 2;

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const inFlightLoads = new Map<string, Promise<string>>();
const waitQueue: Array<() => void> = [];

let activeFetches = 0;
let didRestoreCache = false;

function restoreSnapshotCache(): void {
  if (didRestoreCache || typeof window === "undefined") {
    return;
  }

  didRestoreCache = true;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }

    for (const entry of parsed) {
      if (
        !entry ||
        typeof entry.url !== "string" ||
        typeof entry.html !== "string" ||
        typeof entry.cachedAt !== "number"
      ) {
        continue;
      }

      snapshotCache.set(entry.url, {
        url: entry.url,
        html: entry.html,
        cachedAt: entry.cachedAt,
        size: typeof entry.size === "number" ? entry.size : entry.html.length,
      });
    }

    trimSnapshotCache();
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

function persistSnapshotCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(snapshotCache.values())),
    );
  } catch {
    // Ignore cache persistence failures.
  }
}

function getTotalCacheSize(): number {
  let total = 0;

  for (const entry of snapshotCache.values()) {
    total += entry.size;
  }

  return total;
}

function trimSnapshotCache(): void {
  while (
    snapshotCache.size > MAX_ENTRIES ||
    getTotalCacheSize() > MAX_TOTAL_SIZE
  ) {
    const oldestKey = snapshotCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    snapshotCache.delete(oldestKey);
  }
}

function readCachedSnapshotHtml(url: string): string | null {
  restoreSnapshotCache();

  const cached = snapshotCache.get(url);
  if (!cached) {
    return null;
  }

  snapshotCache.delete(url);
  snapshotCache.set(url, cached);
  persistSnapshotCache();
  return cached.html;
}

function writeCachedSnapshotHtml(url: string, html: string): void {
  restoreSnapshotCache();

  snapshotCache.delete(url);
  snapshotCache.set(url, {
    url,
    html,
    cachedAt: Date.now(),
    size: html.length,
  });

  trimSnapshotCache();
  persistSnapshotCache();
}

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });

  activeFetches += 1;
}

function releaseFetchSlot(): void {
  activeFetches = Math.max(0, activeFetches - 1);
  const next = waitQueue.shift();
  next?.();
}

function normalizeSnapshotCacheUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

/**
 * Warm the in-memory/session snapshot cache without blocking the caller.
 * Safe to call repeatedly — dedupes in-flight loads via `loadCachedSnapshotHtml`.
 */
export function prefetchPageSnapshotUrl(url: string): void {
  const snapshotUrl = normalizeSnapshotCacheUrl(url);
  if (!snapshotUrl || typeof window === "undefined") {
    return;
  }

  void loadCachedSnapshotHtml(snapshotUrl, async () => {
    const response = await fetch(snapshotUrl, {
      credentials: "same-origin",
      headers: {
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to prefetch snapshot HTML: ${response.status}`);
    }

    return await response.text();
  }).catch(() => undefined);
}

export async function loadCachedSnapshotHtml(
  url: string,
  loader: () => Promise<string>,
): Promise<LoadSnapshotHtmlResult> {
  const cached = readCachedSnapshotHtml(url);
  if (cached) {
    return {
      html: cached,
      source: "memory",
    };
  }

  const existingLoad = inFlightLoads.get(url);
  if (existingLoad) {
    return {
      html: await existingLoad,
      source: "shared",
    };
  }

  const loadPromise = (async () => {
    await acquireFetchSlot();

    try {
      const html = await loader();
      writeCachedSnapshotHtml(url, html);
      return html;
    } finally {
      inFlightLoads.delete(url);
      releaseFetchSlot();
    }
  })();

  inFlightLoads.set(url, loadPromise);

  return {
    html: await loadPromise,
    source: "network",
  };
}
