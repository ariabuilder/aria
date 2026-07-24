import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { getAssetSourceUrl, getFontAssetFormat, isFontAsset } from "../utils";
import type { FontAssetFormat, MediaAsset } from "../types";

type FontPreviewStatus = "idle" | "loading" | "ready" | "error";

interface FontPreviewCacheEntry {
  familyName: string;
  source: string;
  status: FontPreviewStatus;
}

const fontPreviewCache = new Map<string, FontPreviewCacheEntry>();

function getFontSource(asset: MediaAsset): string {
  return encodeURI(getAssetSourceUrl(asset));
}

function getPreviewFamilyName(asset: MediaAsset, format: FontAssetFormat): string {
  return `media-font-${asset.id}-${format}`;
}

function getFontFaceFormat(format: FontAssetFormat): string {
  switch (format) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
  }
}

async function loadPreviewFont(asset: MediaAsset): Promise<FontPreviewCacheEntry> {
  const format = getFontAssetFormat(asset);
  if (!format) {
    throw new Error("Asset is not a supported font");
  }

  const source = getFontSource(asset);
  const cacheKey = asset.id;
  const cached = fontPreviewCache.get(cacheKey);
  if (cached && cached.source === source && cached.status === "ready") {
    return cached;
  }

  const familyName = getPreviewFamilyName(asset, format);
  const fontFace = new FontFace(
    familyName,
    `url("${source}") format("${getFontFaceFormat(format)}")`,
    {
      style: "normal",
      weight: "400",
      display: "swap",
    },
  );

  const loadingEntry: FontPreviewCacheEntry = {
    familyName,
    source,
    status: "loading",
  };
  fontPreviewCache.set(cacheKey, loadingEntry);

  try {
    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);

    const readyEntry: FontPreviewCacheEntry = {
      familyName,
      source,
      status: "ready",
    };
    fontPreviewCache.set(cacheKey, readyEntry);
    return readyEntry;
  } catch (error) {
    const failedEntry: FontPreviewCacheEntry = {
      familyName,
      source,
      status: "error",
    };
    fontPreviewCache.set(cacheKey, failedEntry);
    throw error;
  }
}

export interface UseFontPreviewReturn {
  previewFamily: Ref<string | null>;
  status: Ref<FontPreviewStatus>;
  isFont: ComputedRef<boolean>;
  isLoading: ComputedRef<boolean>;
  isReady: ComputedRef<boolean>;
  hasError: ComputedRef<boolean>;
  specimen: ComputedRef<string>;
}

export function useFontPreview(asset: Ref<MediaAsset>): UseFontPreviewReturn {
  const previewFamily = ref<string | null>(null);
  const status = ref<FontPreviewStatus>("idle");

  const isFont = computed(() => isFontAsset(asset.value));
  const isLoading = computed(() => status.value === "loading");
  const isReady = computed(() => status.value === "ready");
  const hasError = computed(() => status.value === "error");
  const specimen = computed(() => "Aa");

  async function syncFontPreview(nextAsset: MediaAsset): Promise<void> {
    if (!isFontAsset(nextAsset)) {
      previewFamily.value = null;
      status.value = "idle";
      return;
    }

    const cached = fontPreviewCache.get(nextAsset.id);
    const source = getFontSource(nextAsset);
    if (cached && cached.source === source) {
      previewFamily.value = cached.familyName;
      status.value = cached.status;
      if (cached.status === "ready" || cached.status === "error") {
        return;
      }
    }

    status.value = "loading";

    try {
      const entry = await loadPreviewFont(nextAsset);
      previewFamily.value = entry.familyName;
      status.value = entry.status;
    } catch {
      previewFamily.value = null;
      status.value = "error";
    }
  }

  watch(
    asset,
    (nextAsset) => {
      void syncFontPreview(nextAsset);
    },
    { immediate: true, deep: false },
  );

  return {
    previewFamily,
    status,
    isFont,
    isLoading,
    isReady,
    hasError,
    specimen,
  };
}
