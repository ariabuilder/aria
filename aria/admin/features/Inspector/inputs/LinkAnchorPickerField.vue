<script setup lang="ts">
import { studioIcons } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PageAnchorTarget } from "@/lib/blocks/collectPageAnchorTargets";
import { useStudioI18n } from "@/i18n";

interface Props {
  label?: string;
  rowClass?: string;
  triggerClass?: string;
  open: boolean;
  anchorSearchQuery: string;
  filteredAnchorOptions: PageAnchorTarget[];
  selectedAnchorOption: PageAnchorTarget | null;
  selectedAnchorTriggerLabel: string;
  selectedAnchorSubtitle: string;
  showCustomAnchorOption: boolean;
  normalizedAnchorSearchQuery: string;
  anchorValidationError?: string | null;
  hasAnchorOptions: boolean;
}

withDefaults(defineProps<Props>(), {
  label: "",
  rowClass: "space-y-1.5",
  triggerClass: "",
  anchorValidationError: null,
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:anchorSearchQuery": [value: string];
  select: [id: string, fromList: boolean];
  selectCustom: [];
}>();

function handleSelect(id: string, fromList: boolean): void {
  emit("select", id, fromList);
}

function handleSelectCustom(): void {
  emit("selectCustom");
}
</script>

<template>
  <div data-testid="link-anchor-row" :class="rowClass">
    <label data-testid="link-anchor-label" class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
      {{ label || t("inspector.anchor.label") }}
    </label>
    <div class="min-w-0 space-y-1">
      <Popover
        :open="open"
        @update:open="emit('update:open', $event)"
      >
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="outline"
            data-testid="link-anchor-trigger"
            class="h-8 w-full justify-between px-3 text-left text-xs font-normal"
            :class="triggerClass"
          >
            <span
              class="flex min-w-0 flex-col items-start text-left leading-tight"
            >
              <span class="truncate text-xs text-foreground">{{
                selectedAnchorTriggerLabel
              }}</span>
              <span
                v-if="selectedAnchorSubtitle"
                class="truncate text-[10px] text-muted-foreground"
              >
                {{ selectedAnchorSubtitle }}
              </span>
            </span>
            <span
              :class="[studioIcons.magnifier, 'h-4 w-4 shrink-0 text-muted-foreground']"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          :side-offset="6"
          class="w-88 p-1.5"
          @open-auto-focus.prevent
        >
          <div class="space-y-2">
            <Input
              data-testid="link-anchor-search"
              :model-value="anchorSearchQuery"
              class="h-8 text-xs"
              :placeholder="t('inspector.anchor.search')"
              @update:model-value="emit('update:anchorSearchQuery', String($event))"
            />

            <ScrollArea class="max-h-72">
              <div class="space-y-1 pr-1">
                <button
                  v-for="anchor in filteredAnchorOptions"
                  :key="anchor.id"
                  type="button"
                  data-testid="link-anchor-option"
                  :data-anchor-id="anchor.id"
                  @click="handleSelect(anchor.id, true)"
                  :class="[
                    'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                    selectedAnchorOption?.id === anchor.id
                      ? 'bg-secondary text-foreground'
                      : 'text-foreground/72 hover:bg-muted/25',
                  ]"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="flex items-center justify-between gap-2 text-xs font-medium"
                    >
                      <span class="truncate">{{ anchor.id }}</span>
                      <span
                        v-if="selectedAnchorOption?.id === anchor.id"
                        :class="[studioIcons.checkCircleBold, 'size-4 text-primary']"
                      />
                    </span>
                    <span
                      class="mt-1 block truncate text-[11px] text-foreground/45"
                    >
                      {{ anchor.label }}
                    </span>
                  </span>
                </button>

                <div
                  v-if="filteredAnchorOptions.length === 0 && !showCustomAnchorOption"
                  data-testid="link-anchor-empty"
                  class="rounded-md px-3 py-4 text-center text-xs text-foreground/45"
                >
                  {{
                    hasAnchorOptions
                      ? t("inspector.anchor.empty")
                      : t("inspector.anchor.none")
                  }}
                </div>
              </div>
            </ScrollArea>

            <button
              v-if="showCustomAnchorOption"
              type="button"
              data-testid="link-anchor-custom"
              class="flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs text-foreground/72 transition-colors hover:bg-muted/25"
              @click="handleSelectCustom"
            >
              {{ t("inspector.anchor.useCustom") }}
              <span class="ml-1 truncate font-medium text-foreground">{{
                normalizedAnchorSearchQuery
              }}</span>
            </button>

            <div
              v-if="anchorValidationError"
              data-testid="link-anchor-validation-error"
              class="text-xs text-destructive"
            >
              {{ anchorValidationError }}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </div>
</template>
