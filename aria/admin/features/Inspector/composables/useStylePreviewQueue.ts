import { onBeforeUnmount } from "vue";

interface UseStylePreviewQueueOptions<
  TUpdates extends Record<string, string | undefined>,
> {
  applyPreview: (updates: Partial<TUpdates>) => void;
  onRestore?: () => void;
}

interface UseStylePreviewQueueReturn<
  TUpdates extends Record<string, string | undefined>,
> {
  cancel: () => void;
  flush: () => void;
  queue: (updates: Partial<TUpdates>) => void;
  restore: (updates: Partial<TUpdates>) => void;
}

export function useStylePreviewQueue<
  TUpdates extends Record<string, string | undefined>,
>(
  options: UseStylePreviewQueueOptions<TUpdates>,
): UseStylePreviewQueueReturn<TUpdates> {
  let pendingPreviewFrame: number | null = null;
  let pendingPreviewUpdates: Partial<TUpdates> | null = null;

  function cancel(): void {
    if (pendingPreviewFrame !== null) {
      window.cancelAnimationFrame(pendingPreviewFrame);
      pendingPreviewFrame = null;
    }
  }

  function flush(): void {
    if (!pendingPreviewUpdates) {
      pendingPreviewFrame = null;
      return;
    }

    options.applyPreview(pendingPreviewUpdates);
    pendingPreviewUpdates = null;
    pendingPreviewFrame = null;
  }

  function queue(updates: Partial<TUpdates>): void {
    pendingPreviewUpdates = {
      ...(pendingPreviewUpdates ?? {}),
      ...updates,
    };

    if (pendingPreviewFrame !== null) {
      return;
    }

    pendingPreviewFrame = window.requestAnimationFrame(() => {
      flush();
    });
  }

  function restore(updates: Partial<TUpdates>): void {
    cancel();
    pendingPreviewUpdates = null;
    options.applyPreview(updates);
    options.onRestore?.();
  }

  onBeforeUnmount(() => {
    cancel();
  });

  return {
    cancel,
    flush,
    queue,
    restore,
  };
}
