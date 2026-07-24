import { ref } from "vue";
import { toast } from "vue-sonner";

import { useBuilderData } from "@/composables/useBuilderData";
import { isThumbnailCaptureSupported } from "@/features/Studio/pages/utils/deviceCapabilities";
import {
  consumeStaleComponentThumbnailIds,
  isComponentThumbnailStale,
  markComponentThumbnailStale,
} from "./componentThumbnailInvalidation";
import { refreshComponentThumbnail } from "./componentThumbnailRefresh";

const thumbnailPendingComponentIds = ref<Set<string>>(new Set());
const thumbnailRefreshTokens = ref<Map<string, string>>(new Map());

function setComponentThumbnailPending(
  componentId: string,
  pending: boolean,
): void {
  const next = new Set(thumbnailPendingComponentIds.value);
  if (pending) {
    next.add(componentId);
  } else {
    next.delete(componentId);
  }
  thumbnailPendingComponentIds.value = next;
}

async function hasStoredThumbnail(thumbnailUrl: string | null | undefined): Promise<boolean> {
  if (typeof thumbnailUrl !== "string" || thumbnailUrl.trim().length === 0) {
    return false;
  }

  try {
    const response = await fetch(thumbnailUrl, {
      cache: "no-store",
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useComponentThumbnailActions() {
  const { components, refreshComponentsNow } = useBuilderData();

  function isComponentThumbnailPending(componentId: string): boolean {
    return thumbnailPendingComponentIds.value.has(componentId.trim());
  }

  function getComponentThumbnailRefreshToken(
    componentId: string,
  ): string | null {
    return thumbnailRefreshTokens.value.get(componentId.trim()) ?? null;
  }

  async function regenerateThumbnail(
    componentId: string,
    options: {
      force?: boolean;
      silent?: boolean;
      markStaleOnFailure?: boolean;
    } = {},
  ): Promise<string | null> {
    const normalized = componentId.trim();
    if (!normalized || isComponentThumbnailPending(normalized)) {
      return null;
    }

    if (!isThumbnailCaptureSupported()) {
      if (!options.silent) {
        toast.error("Thumbnail regeneration is not supported on this device");
      }
      return null;
    }

    setComponentThumbnailPending(normalized, true);

    try {
      const thumbnailUrl = await refreshComponentThumbnail(normalized, {
        force: options.force ?? true,
      });

      if (!thumbnailUrl) {
        if (options.markStaleOnFailure !== false) {
          markComponentThumbnailStale(normalized);
        }
        if (!options.silent) {
          toast.error("Failed to regenerate thumbnail");
        }
        return null;
      }

      await refreshComponentsNow();
      const next = new Map(thumbnailRefreshTokens.value);
      next.set(normalized, String(Date.now()));
      thumbnailRefreshTokens.value = next;

      if (!options.silent) {
        toast.success("Thumbnail regenerated");
      }

      return thumbnailUrl;
    } catch (error) {
      if (options.markStaleOnFailure !== false) {
        markComponentThumbnailStale(normalized);
      }
      if (!options.silent) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to regenerate thumbnail",
        );
      }
      return null;
    } finally {
      setComponentThumbnailPending(normalized, false);
    }
  }

  async function refreshMissingOrStaleThumbnail(
    componentId: string,
    thumbnailUrl?: string | null,
  ): Promise<string | null> {
    const normalized = componentId.trim();
    if (!normalized || isComponentThumbnailPending(normalized)) {
      return null;
    }

    if (isComponentThumbnailStale(normalized)) {
      return await regenerateThumbnail(normalized, {
        force: true,
        silent: true,
        markStaleOnFailure: false,
      });
    }

    const hasThumbnail = await hasStoredThumbnail(thumbnailUrl);
    if (hasThumbnail) {
      return null;
    }

    return await regenerateThumbnail(normalized, {
      force: false,
      silent: true,
      markStaleOnFailure: false,
    });
  }

  async function refreshStaleComponentThumbnails(): Promise<void> {
    const staleComponentIds = consumeStaleComponentThumbnailIds();
    if (staleComponentIds.length === 0 || !isThumbnailCaptureSupported()) {
      return;
    }

    await Promise.all(
      staleComponentIds.map(async (componentId) => {
        const component = components.value.find(
          (entry) => entry.id === componentId,
        );
        if (!component || isComponentThumbnailPending(componentId)) {
          return;
        }

        await regenerateThumbnail(component.id, {
          force: true,
          silent: true,
          markStaleOnFailure: false,
        });
      }),
    );
  }

  return {
    regenerateThumbnail,
    refreshMissingOrStaleThumbnail,
    refreshStaleComponentThumbnails,
    isComponentThumbnailPending,
    getComponentThumbnailRefreshToken,
  };
}
