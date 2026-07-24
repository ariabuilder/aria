/**
 * Global FIFO semaphore that caps how many `/admin/api/page-thumbnails/*` requests can be in flight
 * at once. The Pages grid view can render dozens of `<PagePreviewFrame>` instances.
 */

const MAX_CONCURRENT_THUMBNAIL_FETCHES = 4;

type ThumbnailFetchTask<T> = () => Promise<T>;

let inFlightCount = 0;
const waitingTasks: Array<() => void> = [];

function releaseSlot(): void {
  const next = waitingTasks.shift();
  if (next) {
    next();
    return;
  }
  inFlightCount = Math.max(0, inFlightCount - 1);
}

function acquireSlot(): Promise<void> {
  if (inFlightCount < MAX_CONCURRENT_THUMBNAIL_FETCHES) {
    inFlightCount += 1;
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    waitingTasks.push(() => {
      // The slot is already "owned" by this waiter — we hand it off without
      // touching `inFlightCount` because the previous holder hasn't yet
      // decremented it (see releaseSlot below).
      resolve();
    });
  });
}

/**
 * Run `task` with at most {@link MAX_CONCURRENT_THUMBNAIL_FETCHES} other thumbnail fetches
 * in flight. Pending callers are served FIFO so a.
 */
export async function acquireThumbnailFetchSlot<T>(
  task: ThumbnailFetchTask<T>,
): Promise<T> {
  await acquireSlot();
  try {
    return await task();
  } finally {
    releaseSlot();
  }
}

const prefetchedThumbnailUrls = new Set<string>();

function normalizeThumbnailPrefetchUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("/admin/api/page-thumbnails/") ||
    trimmed.startsWith("/admin/api/component-thumbnails/")
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (
      parsed.pathname.startsWith("/admin/api/page-thumbnails/") ||
      parsed.pathname.startsWith("/admin/api/component-thumbnails/")
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return "";
  }

  return "";
}

/**
 * Warm the browser + service-worker thumbnail cache without blocking the
 * caller. Safe to call repeatedly — dedupes by normalized URL.
 */
export function prefetchPageThumbnailUrl(url: string): void {
  prefetchThumbnailUrl(url);
}

export function prefetchComponentThumbnailUrl(url: string): void {
  prefetchThumbnailUrl(url);
}

function prefetchThumbnailUrl(url: string): void {
  const thumbnailUrl = normalizeThumbnailPrefetchUrl(url);
  if (
    !thumbnailUrl ||
    prefetchedThumbnailUrls.has(thumbnailUrl) ||
    typeof window === "undefined"
  ) {
    return;
  }

  prefetchedThumbnailUrls.add(thumbnailUrl);

  void acquireThumbnailFetchSlot(() =>
    fetch(thumbnailUrl, {
      credentials: "same-origin",
    }),
  ).catch(() => {
    /* Prefetch failures are non-fatal; visible cards handle their own state. */
  });
}
