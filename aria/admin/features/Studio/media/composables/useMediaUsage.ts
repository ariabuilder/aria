import { computed, ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { useBuilderData } from "@/composables/useBuilderData";
import type { MediaAsset, MediaUsageItem } from "../types/media";
import { unwrapMediaUsagesResult } from "./mediaActionResults";

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

type MediaUsageCacheEntry = {
  status: "ready";
  usages: MediaUsageItem[];
  source: "indexed" | "unavailable";
};

function resolveUsageItem(
  usage: { kind: MediaUsageItem["kind"]; refId: string },
  builderData: ReturnType<typeof useBuilderData>,
): MediaUsageItem {
  if (usage.kind === "page") {
    const page = builderData.pages.value.find(
      (entry) => entry.id === usage.refId,
    );
    const slug = page?.slug || page?.id || usage.refId;

    return {
      kind: "page",
      id: usage.refId,
      title: page?.title || usage.refId,
      path: `/${slug}`,
    };
  }

  if (usage.kind === "layout") {
    const layout = builderData.layouts.value.find(
      (entry) => entry.id === usage.refId,
    );

    return {
      kind: "layout",
      id: usage.refId,
      title: layout?.name || usage.refId,
      path: usage.refId,
    };
  }

  if (usage.kind === "component") {
    const component = builderData.components.value.find(
      (entry) => entry.id === usage.refId,
    );

    return {
      kind: "component",
      id: usage.refId,
      title: component?.name || usage.refId,
      path: usage.refId,
    };
  }

  const titles: Record<
    Exclude<MediaUsageItem["kind"], "page" | "layout" | "component">,
    string
  > = {
    "cms-entry": "CMS entry",
    "page-locale": "Page translation",
    "layout-locale": "Layout translation",
    "site-settings": "Site settings",
    "design-system": "Design system",
  };

  return {
    kind: usage.kind,
    id: usage.refId,
    title: titles[usage.kind],
    path: usage.refId,
  };
}

export function useMediaUsage(selectedAsset: Ref<MediaAsset | null>) {
  const mediaUsageByAsset = ref<Record<string, MediaUsageCacheEntry>>({});
  const usageLoadingAssetId = ref<string | null>(null);
  const builderData = useBuilderData();

  const selectedAssetUsages = computed<MediaUsageItem[]>(() => {
    if (!selectedAsset.value) return [];
    return mediaUsageByAsset.value[selectedAsset.value.id]?.usages || [];
  });

  const isUsageLoading = computed(() => {
    return (
      !!selectedAsset.value &&
      usageLoadingAssetId.value === selectedAsset.value.id
    );
  });

  async function ensureUsageComputed(asset: MediaAsset): Promise<void> {
    const cachedUsages = mediaUsageByAsset.value[asset.id];
    if (cachedUsages?.status === "ready") return;
    if (usageLoadingAssetId.value === asset.id) return;

    usageLoadingAssetId.value = asset.id;

    try {
      const usageResult = unwrapMediaUsagesResult(
        await actions.media.usages({
          logicalPath: asset.url,
        }),
        {
          source: "useMediaUsage.ensureUsageComputed",
          assetId: asset.id,
          logicalPath: asset.url,
        },
      );

      if (!usageResult.success) {
        throw new Error(usageResult.error);
      }

      let usageItems: MediaUsageItem[] = [];
      if (usageResult.data.usages.length > 0) {
        await builderData.fetchBuilderData({ silent: true });

        usageItems = usageResult.data.usages
          .map((usage) =>
            resolveUsageItem(
              {
                kind: usage.kind,
                refId: usage.refId,
              },
              builderData,
            ),
          )
          .filter(isDefined);
      }

      mediaUsageByAsset.value = {
        ...mediaUsageByAsset.value,
        [asset.id]: {
          status: "ready",
          usages: usageItems,
          source: usageResult.data.source,
        },
      };
    } catch (error) {
      log("error", "[MediaView] Failed computing media usage", {
        assetId: asset.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (usageLoadingAssetId.value === asset.id) {
        usageLoadingAssetId.value = null;
      }
    }
  }

  return {
    builderData,
    selectedAssetUsages,
    isUsageLoading,
    ensureUsageComputed,
  };
}
