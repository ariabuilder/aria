import { isThumbnailCaptureSupported } from "@/features/Studio/pages/utils/deviceCapabilities";
import { enqueueComponentThumbnailGeneration } from "./componentThumbnailBackgroundQueue";

const inFlightRefreshes = new Map<string, Promise<string | null>>();

export async function refreshComponentThumbnail(
  componentId: string,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const normalized = componentId.trim();
  if (!normalized || !isThumbnailCaptureSupported()) {
    return null;
  }

  const force = options.force ?? true;
  const existing = inFlightRefreshes.get(normalized);
  if (existing) {
    return await existing;
  }

  const refreshPromise = enqueueComponentThumbnailGeneration(normalized, {
    force,
  }).finally(() => {
    if (inFlightRefreshes.get(normalized) === refreshPromise) {
      inFlightRefreshes.delete(normalized);
    }
  });

  inFlightRefreshes.set(normalized, refreshPromise);
  return await refreshPromise;
}

/** Test-only reset */
export function resetComponentThumbnailRefreshState(): void {
  inFlightRefreshes.clear();
}
