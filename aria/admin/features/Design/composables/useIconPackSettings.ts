import { computed, onMounted, ref, type Ref } from "vue";
import { toast } from "vue-sonner";

import { useStudioI18n } from "@/i18n";
import { log } from "@/lib/utils/logger";
import {
  useSiteSettings,
  type IconPackKey,
} from "../../../composables/useSiteSettings";

export function useIconPackSettings() {
  const { t } = useStudioI18n();
  const { loadSettings, isIconPackEnabled, toggleIconPack, ICON_PACK_CATALOG } =
    useSiteSettings();

  const isLoading: Ref<boolean> = ref(false);
  const isSaving: Ref<boolean> = ref(false);

  const iconPacks = computed(() =>
    ICON_PACK_CATALOG.filter((pack) => pack.group === "icon"),
  );

  const brandPacks = computed(() =>
    ICON_PACK_CATALOG.filter((pack) => pack.group === "brand"),
  );

  onMounted(async (): Promise<void> => {
    isLoading.value = true;
    try {
      await loadSettings();
    } catch (error: unknown) {
      log("error", "Failed to load icon settings", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(t("design.icons.loadSettingsFailed"));
    } finally {
      isLoading.value = false;
    }
  });

  async function onTogglePack(
    pack: IconPackKey,
    nextEnabled?: boolean,
  ): Promise<void> {
    isSaving.value = true;
    try {
      await toggleIconPack(pack, nextEnabled);
      toast.success(t("design.icons.packUpdated"));
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("design.icons.updateFailed"),
      );
    } finally {
      isSaving.value = false;
    }
  }

  function openWebsite(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return {
    isLoading,
    isSaving,
    iconPacks,
    brandPacks,
    isIconPackEnabled,
    onTogglePack,
    openWebsite,
  };
}
