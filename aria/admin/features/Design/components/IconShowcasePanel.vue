<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import type { IconPackKey } from "../../../composables/useSiteSettings";
import { useIconShowcase } from "../composables/useIconShowcase";

const props = defineProps<{
  packId: IconPackKey | "";
  packLabel: string;
  enabled: boolean;
}>();

const { t } = useStudioI18n();
const packIdRef = computed(() => props.packId);

const {
  search,
  items,
  iconSvgs,
  isLoading,
  copiedId,
  loadError,
  canGoPrev,
  canGoNext,
  canLoadMore,
  resultContext,
  loadNextPage,
  loadPrevPage,
  loadMoreSearchResults,
  copyIconClass,
  toIconClass,
} = useIconShowcase(packIdRef);
</script>

<template>
  <section
    class="flex min-h-[36rem] flex-col overflow-hidden rounded-md border border-dashed border-border/50 bg-card/40 xl:sticky xl:top-5 xl:max-h-[calc(100dvh-6rem)]"
  >
    <div
      class="flex items-start justify-between gap-3 border-b border-dashed border-border/50 px-4 py-3"
    >
      <div class="min-w-0">
        <p class="m-0 text-xs font-medium text-muted-foreground/75">
          {{ t("design.icons.preview") }}
        </p>
        <h2
          class="m-0 truncate text-lg font-serif font-medium text-foreground"
        >
          {{ packLabel || t("design.icons.iconPack") }}
        </h2>
      </div>
    </div>

    <div
      v-if="!enabled && packId"
      class="border-b border-dashed border-border/50 bg-muted/30 px-4 py-2.5"
    >
      <p class="text-xs text-muted-foreground">
        {{ t("design.icons.disabledPicker") }}
      </p>
    </div>

    <div class="border-b border-dashed border-border/50 px-4 py-3">
      <div class="relative">
        <span
          :class="[
            studioIcons.search,
            'pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground',
          ]"
        />
        <Input
          v-model="search"
          type="search"
          :placeholder="
            t('design.icons.filterPlaceholder', {
              label: packLabel || t('design.icons.icons'),
            })
          "
          :disabled="!packId"
          class="h-8 pl-8 text-xs"
        />
      </div>
    </div>

    <ScrollArea
      class="min-h-0 flex-1 overscroll-contain [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:overscroll-contain"
    >
      <div class="p-3">
        <div
          v-if="!packId"
          class="flex min-h-48 items-center justify-center px-4 text-center text-sm text-muted-foreground"
        >
          {{ t("design.icons.selectPack") }}
        </div>

        <div
          v-else-if="loadError"
          class="px-2 py-6 text-sm text-muted-foreground"
        >
          {{ loadError }}
        </div>

        <div
          v-else-if="isLoading && items.length === 0"
          class="grid grid-cols-6 gap-1.5 sm:grid-cols-8"
        >
          <div
            v-for="skeleton in 80"
            :key="skeleton"
            class="aspect-square animate-pulse rounded-md border border-border/50 bg-muted/30"
          />
        </div>

        <div
          v-else-if="items.length === 0"
          class="px-2 py-6 text-sm text-muted-foreground"
        >
          {{ t("design.icons.noIconsFound") }}
        </div>

        <TooltipProvider v-else :delay-duration="200">
          <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            <Tooltip v-for="icon in items" :key="icon.id">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="group relative flex aspect-square items-center justify-center rounded-md border border-transparent bg-background/70 text-muted-foreground transition-colors hover:border-dashed hover:border-border hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="
                    copiedId === icon.id
                      ? 'border-primary/40 bg-primary/5 text-primary'
                      : ''
                  "
                  :aria-label="
                    t('design.icons.copyIconClass', {
                      iconClass: toIconClass(icon.id),
                    })
                  "
                  @click="copyIconClass(icon.id)"
                >
                  <div
                    v-if="iconSvgs[icon.id]"
                    class="size-5 shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    v-html="iconSvgs[icon.id]"
                  />
                  <div
                    v-else
                    class="size-4 shrink-0 rounded-sm border border-border/50"
                  />
                  <span
                    v-if="copiedId === icon.id"
                    :class="[
                      studioIcons.checkLinear,
                      'absolute right-0.5 top-0.5 size-2.5 text-primary',
                    ]"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">
                {{
                  copiedId === icon.id
                    ? t("design.icons.copiedIconClass", {
                        iconClass: toIconClass(icon.id),
                      })
                    : icon.label
                }}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </ScrollArea>

    <div
      class="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-dashed border-border/50 px-4"
    >
      <div class="truncate text-xs text-muted-foreground">
        {{ packLabel }}
      </div>
      <div class="text-center text-xs text-muted-foreground">
        {{ resultContext }}
      </div>
      <div class="flex items-center justify-end gap-2">
        <Button
          v-if="search.trim().length === 0"
          variant="outline"
          size="sm"
          :disabled="!canGoPrev || isLoading"
          @click="loadPrevPage"
        >
          {{ t("design.icons.previous") }}
        </Button>
        <Button
          v-if="search.trim().length === 0"
          variant="outline"
          size="sm"
          :disabled="!canGoNext || isLoading"
          @click="loadNextPage"
        >
          {{ t("design.icons.next") }}
        </Button>
        <Button
          v-if="search.trim().length > 0"
          variant="outline"
          size="sm"
          :disabled="!canLoadMore || isLoading"
          @click="loadMoreSearchResults"
        >
          {{ t("design.icons.loadMore") }}
        </Button>
      </div>
    </div>
  </section>
</template>
