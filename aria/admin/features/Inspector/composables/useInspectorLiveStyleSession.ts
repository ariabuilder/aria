import { ref, type Ref } from "vue";

import { useStylePreviewQueue } from "./useStylePreviewQueue";

export interface UseInspectorLiveStyleSessionOptions<
  TUpdates extends Record<string, string | undefined>,
> {
  applyPreview: (updates: Partial<TUpdates>) => void;
  captureOrigin?: () => Partial<TUpdates>;
  onRestore?: () => void;
}

export interface UseInspectorLiveStyleSessionReturn<
  TUpdates extends Record<string, string | undefined>,
> {
  hasPendingPreview: Ref<boolean>;
  beginPreview: () => void;
  queuePreview: (updates: Partial<TUpdates>) => void;
  flushPreview: () => void;
  cancelPreview: () => void;
  restorePreview: (updates: Partial<TUpdates>) => void;
  clearPending: () => void;
}

/**
 * Tracks canvas preview origin and batches preview updates (rAF).
 * Persist is handled by the caller after flushPreview().
 */
export function useInspectorLiveStyleSession<
  TUpdates extends Record<string, string | undefined>,
>(
  options: UseInspectorLiveStyleSessionOptions<TUpdates>,
): UseInspectorLiveStyleSessionReturn<TUpdates> {
  const hasPendingPreview = ref(false);
  const originUpdates = ref<Partial<TUpdates> | null>(null);

  const previewQueue = useStylePreviewQueue<TUpdates>({
    applyPreview: options.applyPreview,
    onRestore: options.onRestore,
  });

  function beginPreview(): void {
    if (originUpdates.value === null) {
      originUpdates.value = options.captureOrigin?.() ?? {};
    }
    hasPendingPreview.value = true;
  }

  function queuePreview(updates: Partial<TUpdates>): void {
    beginPreview();
    previewQueue.queue(updates);
  }

  function flushPreview(): void {
    previewQueue.flush();
  }

  function cancelPreview(): void {
    if (originUpdates.value) {
      previewQueue.restore(originUpdates.value);
    } else {
      previewQueue.cancel();
    }
    hasPendingPreview.value = false;
    originUpdates.value = null;
  }

  function restorePreview(updates?: Partial<TUpdates>): void {
    previewQueue.restore(updates ?? originUpdates.value ?? {});
    hasPendingPreview.value = false;
    originUpdates.value = null;
  }

  function clearPending(): void {
    hasPendingPreview.value = false;
    originUpdates.value = null;
  }

  return {
    hasPendingPreview,
    beginPreview,
    queuePreview,
    flushPreview,
    cancelPreview,
    restorePreview,
    clearPending,
  };
}
