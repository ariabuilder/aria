/**
 * Caps concurrent client-side thumbnail captures. Each capture mounts a hidden iframe, rasterises
 * snapshot HTML, and uploads the result — running many in parallel (e.
 */

const MAX_CONCURRENT_THUMBNAIL_GENERATIONS = 2;

type ThumbnailGenerationTask<T> = () => Promise<T>;

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
  if (inFlightCount < MAX_CONCURRENT_THUMBNAIL_GENERATIONS) {
    inFlightCount += 1;
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    waitingTasks.push(() => {
      resolve();
    });
  });
}

export async function acquireThumbnailGenerationSlot<T>(
  task: ThumbnailGenerationTask<T>,
): Promise<T> {
  await acquireSlot();
  try {
    return await task();
  } finally {
    releaseSlot();
  }
}
