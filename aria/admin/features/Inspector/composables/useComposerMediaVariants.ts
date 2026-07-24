import { computed, ref } from "vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { useMediaTransforms } from "@/features/Studio/media/composables/useMediaTransforms";
import {
  buildCurrentMediaSourceUrl,
  buildMediaTransformUrl,
} from "../../../../lib/media/transforms/urls";
import type { ComposerMediaReference } from "../../../../lib/media/composerReference";
import { MEDIA_TRANSFORM_INPUT_MAX_BYTES } from "../../../../lib/media/uploadLimits";

export type ComposerMediaSelection = {
  url: string;
  reference: ComposerMediaReference;
  width: number | null;
  height: number | null;
  supportsResponsiveDelivery: boolean;
};

export function useComposerMediaVariants() {
  const transforms = useMediaTransforms();
  const asset = ref<MediaAsset | null>(null);
  const selectedVariantId = ref<string | null>(null);

  const variants = computed(() => transforms.state.value?.variants ?? []);
  const currentSourceVersion = computed(
    () => transforms.state.value?.profile?.currentSourceVersion ?? null,
  );
  const isStaleVariant = computed(() => {
    if (!selectedVariantId.value) return false;
    const variant = variants.value.find(
      (item) => item.id === selectedVariantId.value,
    );
    const currentVersion =
      transforms.state.value?.profile?.currentSourceVersion;
    return Boolean(
      variant && currentVersion && variant.sourceVersion !== currentVersion,
    );
  });

  async function loadForAsset(
    nextAsset: MediaAsset,
    variantId: string | null = null,
  ): Promise<void> {
    asset.value = nextAsset;
    selectedVariantId.value = variantId;
    await transforms.load(nextAsset.url);
    if (
      selectedVariantId.value &&
      !variants.value.some((variant) => variant.id === selectedVariantId.value)
    ) {
      selectedVariantId.value = null;
    }
  }

  async function hydrate(
    reference: ComposerMediaReference | undefined,
    assets: readonly MediaAsset[],
  ): Promise<void> {
    if (!reference) {
      clear();
      return;
    }
    const nextAsset = assets.find((item) => item.mediaId === reference.mediaId);
    if (!nextAsset) {
      clear();
      return;
    }
    await loadForAsset(nextAsset, reference.variantId);
  }

  function selectVariant(
    variantId: string | null,
  ): ComposerMediaSelection | null {
    const currentAsset = asset.value;
    const mediaId = currentAsset?.mediaId;
    if (!currentAsset || !mediaId) return null;

    selectedVariantId.value = variantId;
    if (!variantId) {
      const sourceVersion =
        transforms.state.value?.profile?.currentSourceVersion ??
        Math.max(
          0,
          ...(transforms.state.value?.sourceVersions.map(
            (source) => source.version,
          ) ?? []),
        );
      const source = transforms.state.value?.sourceVersions.find(
        (item) => item.version === sourceVersion,
      );
      return {
        url: buildCurrentMediaSourceUrl({ assetPath: currentAsset.url }),
        reference: { mediaId, variantId: null },
        width: currentAsset.dimensions?.width ?? source?.width ?? null,
        height: currentAsset.dimensions?.height ?? source?.height ?? null,
        supportsResponsiveDelivery:
          currentAsset.size <= MEDIA_TRANSFORM_INPUT_MAX_BYTES &&
          Boolean(source?.width),
      };
    }

    const variant = variants.value.find((item) => item.id === variantId);
    if (!variant) return null;
    return {
      url: buildMediaTransformUrl(variant),
      reference: { mediaId, variantId: variant.id },
      width: variant.output.width,
      height: variant.output.height,
      supportsResponsiveDelivery: true,
    };
  }

  function clear(): void {
    asset.value = null;
    selectedVariantId.value = null;
    transforms.state.value = null;
  }

  return {
    asset,
    variants,
    currentSourceVersion,
    selectedVariantId,
    isLoading: transforms.isLoading,
    isStaleVariant,
    loadForAsset,
    hydrate,
    selectVariant,
    clear,
  };
}
