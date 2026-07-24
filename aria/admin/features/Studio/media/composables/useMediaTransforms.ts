import { ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import {
  MediaAssetProfileSchema,
  MediaTransformStateSchema,
  SaveMediaTransformVariantResultSchema,
  type MediaTransformState,
  type SaveMediaAssetProfileInput,
  type SaveMediaTransformVariantInput,
} from "../../../../../lib/media/transforms/schemas";
import { updateSharedMediaAssetCropCount } from "./useMediaAssets";
import { useStudioI18n } from "@/i18n";

export function useMediaTransforms() {
  const { t } = useStudioI18n();
  const state = ref<MediaTransformState | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  let loadGeneration = 0;

  async function load(assetPath: string): Promise<void> {
    const generation = ++loadGeneration;
    isLoading.value = true;
    state.value = null;
    try {
      const { data, error } = await actions.media.getTransformState({
        assetPath,
      });
      if (error) throw new Error(error.message);
      if (generation === loadGeneration) {
        state.value = MediaTransformStateSchema.parse(data);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("media.imageEditor.unableToLoadEdits"),
      );
    } finally {
      if (generation === loadGeneration) isLoading.value = false;
    }
  }

  async function saveProfile(
    input: SaveMediaAssetProfileInput,
    options?: { silent?: boolean },
  ) {
    isSaving.value = true;
    try {
      const { data, error } = await actions.media.saveProfile(input);
      if (error) throw new Error(error.message);
      const profile = MediaAssetProfileSchema.parse(data);
      if (state.value) state.value.profile = profile;
      if (!options?.silent) {
        toast.success(t("media.imageEditor.imageMetadataSaved"));
      }
      return profile;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("media.imageEditor.unableToSaveImageMetadata"),
      );
      throw error;
    } finally {
      isSaving.value = false;
    }
  }

  async function saveVariant(
    input: SaveMediaTransformVariantInput,
    options?: { silent?: boolean },
  ) {
    isSaving.value = true;
    try {
      const { data, error } = await actions.media.saveTransformVariant(input);
      if (error) throw new Error(error.message);
      const { profile, variant } =
        SaveMediaTransformVariantResultSchema.parse(data);
      if (state.value) {
        state.value.profile = profile;
        const index = state.value.variants.findIndex(
          (item) => item.id === variant.id,
        );
        if (index === -1) state.value.variants.push(variant);
        else state.value.variants[index] = variant;
        updateSharedMediaAssetCropCount(
          variant.assetPath,
          state.value.variants.length,
        );
      }
      if (!options?.silent) toast.success(t("media.imageEditor.variantSaved"));
      return variant;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("media.imageEditor.unableToSaveVariant"),
      );
      throw error;
    } finally {
      isSaving.value = false;
    }
  }

  async function deleteVariant(assetPath: string, id: string): Promise<void> {
    isSaving.value = true;
    try {
      const { error } = await actions.media.deleteTransformVariant({
        assetPath,
        id,
      });
      if (error) throw new Error(error.message);
      if (state.value) {
        state.value.variants = state.value.variants.filter(
          (item) => item.id !== id,
        );
        updateSharedMediaAssetCropCount(assetPath, state.value.variants.length);
      }
      toast.success(t("media.imageEditor.variantRemoved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("media.imageEditor.unableToRemoveVariant"),
      );
      throw error;
    } finally {
      isSaving.value = false;
    }
  }

  return {
    state,
    isLoading,
    isSaving,
    load,
    saveProfile,
    saveVariant,
    deleteVariant,
  };
}
