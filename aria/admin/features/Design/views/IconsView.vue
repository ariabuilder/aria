<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import type { IconPackKey } from "../../../composables/useSiteSettings";
import IconShowcasePanel from "../components/IconShowcasePanel.vue";
import { useIconPackSettings } from "../composables";

const {
  isLoading,
  isSaving,
  iconPacks,
  brandPacks,
  isIconPackEnabled,
  onTogglePack,
  openWebsite,
} = useIconPackSettings();

const { t } = useStudioI18n();

/** Admin chrome only has Hugeicons; pack previewIcon classes are site packs. */
const PACK_MARK_ICONS: Record<IconPackKey, string> = {
  lucide: studioIcons.sparkles,
  "coreui-brands": studioIcons.globe,
};

const iconSources = computed(() => [
  ...iconPacks.value,
  ...brandPacks.value,
]);

const focusedPackId = ref<IconPackKey | "">("");

watch(
  iconSources,
  (sources) => {
    if (sources.length === 0) {
      focusedPackId.value = "";
      return;
    }

    if (
      !focusedPackId.value ||
      !sources.some((pack) => pack.id === focusedPackId.value)
    ) {
      const firstEnabled = sources.find((pack) => isIconPackEnabled(pack.id));
      focusedPackId.value = (firstEnabled ?? sources[0]).id;
    }
  },
  { immediate: true },
);

const focusedPack = computed(
  () =>
    iconSources.value.find((pack) => pack.id === focusedPackId.value) ?? null,
);

function focusPack(packId: IconPackKey): void {
  focusedPackId.value = packId;
}

function packLabel(packId: IconPackKey, fallback: string): string {
  switch (packId) {
    case "lucide":
      return t("design.icons.pack.lucide");
    case "coreui-brands":
      return t("design.icons.pack.coreuiBrands");
    default:
      return fallback;
  }
}

function packDescription(packId: IconPackKey, fallback: string): string {
  switch (packId) {
    case "lucide":
      return t("design.icons.pack.lucideDescription");
    case "coreui-brands":
      return t("design.icons.pack.coreuiBrandsDescription");
    default:
      return fallback;
  }
}
</script>

<template>
  <div class="page-card-enter px-5 py-5">
    <div v-if="isLoading" class="flex items-center justify-center py-16">
      <div
        :class="[studioIcons.loading, 'h-5 w-5 animate-spin text-muted-foreground']"
      />
    </div>

    <div
      v-else
      class="mx-auto grid max-w-6xl min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(20rem,1fr)]"
    >
      <div class="min-w-0 space-y-4">
        <section class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-1">
            <article
              v-for="pack in iconSources"
              :key="pack.id"
              role="button"
              tabindex="0"
              class="flex flex-col gap-3 rounded-md border border-dashed border-border/50 bg-card/40 p-5 transition-all duration-150 hover:border-border hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="
                focusedPackId === pack.id
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : ''
              "
              @click="focusPack(pack.id)"
              @keydown.enter.prevent="focusPack(pack.id)"
              @keydown.space.prevent="focusPack(pack.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    :class="[
                      PACK_MARK_ICONS[pack.id],
                      'size-8 shrink-0 text-foreground',
                    ]"
                    aria-hidden="true"
                  />
                  <div class="flex min-w-0 items-center gap-2">
                    <h3
                      class="truncate text-lg font-serif font-medium leading-none text-foreground"
                    >
                      {{ packLabel(pack.id, pack.label) }}
                    </h3>
                    <span
                      class="shrink-0 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-2xs font-mono text-muted-foreground"
                    >
                      {{ pack.iconCount }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2" @click.stop>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="headerAction"
                          size="icon-header"
                          :aria-label="
                            t('design.icons.openWebsite', {
                              label: packLabel(pack.id, pack.label),
                            })
                          "
                          @click="openWebsite(pack.website)"
                        >
                          <span :class="[studioIcons.externalLink, 'size-3']" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {{
                          t("design.icons.openWebsite", {
                            label: packLabel(pack.id, pack.label),
                          })
                        }}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Switch
                    :model-value="isIconPackEnabled(pack.id)"
                    :disabled="isSaving"
                    :aria-label="
                      t(
                        isIconPackEnabled(pack.id)
                          ? 'design.icons.disablePack'
                          : 'design.icons.enablePack',
                        { label: packLabel(pack.id, pack.label) },
                      )
                    "
                    @update:model-value="
                      (next) => onTogglePack(pack.id, Boolean(next))
                    "
                  />
                </div>
              </div>

              <p class="text-sm leading-relaxed text-muted-foreground">
                {{ packDescription(pack.id, pack.description) }}
              </p>
            </article>
          </div>
        </section>

        <div
          class="flex items-center gap-3 rounded-md border border-dashed border-border/50 bg-card/20 px-4 py-3"
        >
          <span
            class="grid size-7 shrink-0 place-items-center rounded-md border border-dashed border-border text-foreground"
          >
            <span :class="[studioIcons.upload, 'size-3.5']" />
          </span>
          <p class="text-xs text-muted-foreground">
            {{ t("design.icons.uploadedSvgNote") }}
          </p>
        </div>
      </div>

      <IconShowcasePanel
        :pack-id="focusedPackId"
        :pack-label="
          focusedPack ? packLabel(focusedPack.id, focusedPack.label) : ''
        "
        :enabled="focusedPack ? isIconPackEnabled(focusedPack.id) : false"
      />
    </div>
  </div>
</template>
