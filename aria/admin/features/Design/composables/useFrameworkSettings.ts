import { computed, onMounted, ref, type Ref } from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";

import { useStudioI18n } from "@/i18n";
import { log } from "@/lib/utils/logger";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { CSSFrameworkSchema } from "../../../../lib/schemas/nodes";

type UtilityEngine = z.infer<typeof CSSFrameworkSchema>;

export interface UtilityEngineCard {
  id: UtilityEngine;
  name: string;
  summary: string;
  websiteUrl: string;
  version: string;
  tags: string[];
}

export interface UtilityCard {
  key: string;
  id: UtilityEngine;
  name: string;
  summary: string;
  websiteUrl: string;
  version: string;
  tags: string[];
  isActive: boolean;
}

const utilityEngineCards: UtilityEngineCard[] = [
  {
    id: "unocss",
    name: "UnoCSS",
    summary: "",
    websiteUrl: "https://unocss.dev/",
    version: "v66.6.8",
    tags: [],
  },
];

export function useFrameworkSettings() {
  const { t } = useStudioI18n();
  const { utilityEngine, loadSettings, saveSettings } = useSiteSettings();

  const isLoading: Ref<boolean> = ref(false);
  const isSaving: Ref<boolean> = ref(false);

  onMounted(async (): Promise<void> => {
    isLoading.value = true;

    try {
      await loadSettings();
    } catch (error: unknown) {
      log("error", "[FrameworkView] Failed to load utility settings", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(t("design.utilities.toast.loadFailed"));
    } finally {
      isLoading.value = false;
    }
  });

  function isCardActive(cardId: UtilityEngine): boolean {
    return utilityEngine.value === cardId;
  }

  async function setUtilityEngineEnabled(
    cardId: UtilityEngine,
    enabled: boolean,
  ): Promise<void> {
    const nextMode: UtilityEngine = enabled ? cardId : "custom";
    const parsedMode = CSSFrameworkSchema.safeParse(nextMode);
    if (!parsedMode.success) {
      toast.error(t("design.utilities.toast.invalidEngine"));
      return;
    }

    if (
      (enabled && isCardActive(cardId)) ||
      (!enabled && !isCardActive(cardId))
    ) {
      return;
    }

    isSaving.value = true;

    try {
      await saveSettings({ utilityEngine: parsedMode.data });
      toast.success(
        parsedMode.data === "unocss"
          ? t("design.utilities.toast.enabled")
          : t("design.utilities.toast.disabled"),
      );
    } catch (error: unknown) {
      log("error", "[FrameworkView] Failed to save utility settings", {
        error: error instanceof Error ? error.message : String(error),
        mode: parsedMode.data,
      });
      toast.error(t("design.utilities.toast.updateFailed"));
    } finally {
      isSaving.value = false;
    }
  }

  function openWebsite(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const utilityCards = computed<UtilityCard[]>(() =>
    utilityEngineCards.map((card) => ({
      key: `engine-${card.id}`,
      id: card.id,
      name: card.name,
      summary:
        card.id === "unocss"
          ? t("design.utilities.unocss.summary")
          : card.summary,
      websiteUrl: card.websiteUrl,
      version: card.version,
      tags:
        card.id === "unocss"
          ? [
              t("design.utilities.unocss.tag.atomicCss"),
              t("design.utilities.unocss.tag.tailwindClasses"),
              t("design.utilities.unocss.tag.onDemand"),
            ]
          : card.tags,
      isActive: isCardActive(card.id),
    })),
  );

  return {
    utilityCards,
    isLoading,
    isSaving,
    setUtilityEngineEnabled,
    openWebsite,
  };
}
