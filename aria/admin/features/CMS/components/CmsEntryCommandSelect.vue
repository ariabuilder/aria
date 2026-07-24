<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { studioIcons } from "@/lib/icons";
import { useCmsEntriesList } from "../composables/useCmsEntriesList";
import { CmsEntryRowSchema, type CmsEntryRow } from "../lib/entryRow";
import { resolveTargetCollectionId } from "../lib/resolveEntryLabels";
import { useStudioI18n } from "@/i18n";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    targetCollection: string;
    disabled?: boolean;
    placeholder?: string;
    emptyLabel?: string;
    contentClass?: string;
    variant?: "default" | "sidebar";
    leadingIcon?: string;
    clearable?: boolean;
  }>(),
  {
    modelValue: "",
    disabled: false,
    placeholder: "",
    emptyLabel: "",
    contentClass: "w-[var(--reka-popover-trigger-width)]",
    variant: "default",
    leadingIcon: "",
    clearable: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [entry: CmsEntryRow];
  clear: [];
}>();
const { t } = useStudioI18n();
const attrs = useAttrs();

const open = defineModel<boolean>("open", { default: false });
const targetCollectionId = ref("");

const {
  rows,
  total,
  page,
  totalPages,
  searchQuery,
  isLoading,
  loadError,
  loadEntries,
  setPage,
} = useCmsEntriesList(targetCollectionId);

const selectedEntry = computed(
  () => rows.value.find((row) => row.id === props.modelValue) ?? null,
);

const triggerLabel = computed(
  () => selectedEntry.value?.title || props.placeholder || t("cms.entryPicker.choose"),
);

watch(
  () => props.targetCollection,
  (targetCollection) => {
    const normalized = targetCollection.trim();
    if (!normalized) {
      targetCollectionId.value = "";
      return;
    }
    void resolveTargetCollectionId(normalized)
      .then((collectionId) => {
        if (props.targetCollection.trim() === normalized) {
          targetCollectionId.value = collectionId;
        }
      })
      .catch(() => {
        if (props.targetCollection.trim() === normalized) {
          targetCollectionId.value = normalized;
        }
      });
  },
  { immediate: true },
);

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      void loadEntries();
    }
  },
  { immediate: true },
);

function selectEntry(entry: CmsEntryRow): void {
  const parsed = CmsEntryRowSchema.parse(entry);
  emit("update:modelValue", parsed.id);
  emit("select", parsed);
  open.value = false;
}

function clearSelection(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  emit("clear");
}
</script>

<template>
  <div v-bind="attrs" class="relative min-w-0 w-full">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          v-if="variant === 'default'"
          type="button"
          variant="outline"
          :class="[
            'relative h-9! w-full min-w-0 rounded-sm border! border-border/50! border-solid! bg-sidebar/40! px-4 text-left text-sm font-normal hover:border-border/50! hover:border-solid! hover:bg-sidebar/80! focus-visible:border-border! focus-visible:border-solid! focus-visible:bg-sidebar/80! data-[state=open]:border-border! data-[state=open]:border-solid! data-[state=open]:bg-sidebar/80!',
          ]"
          :disabled="disabled || !targetCollection"
        >
          <span
            :class="[
              'absolute left-3 top-1/2 block -translate-y-1/2 truncate text-left',
              clearable && modelValue ? 'right-14' : 'right-8',
            ]"
          >
            {{ triggerLabel }}
          </span>
          <span
            :class="[
              studioIcons.chevronDown,
              'absolute right-3 top-1/2 size-3.5 -translate-y-1/2 opacity-60',
            ]"
          />
        </Button>
        <button
          v-else
          type="button"
          class="flex min-w-0 w-full flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-card/50 disabled:cursor-default disabled:hover:bg-transparent"
          :disabled="disabled || !targetCollection"
        >
          <div
            v-if="leadingIcon"
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-transparent"
          >
            <span :class="[leadingIcon, 'h-4 w-4 text-muted-foreground']" />
          </div>
          <span
            class="min-w-0 flex-1 truncate text-xs font-serif tracking-wide text-muted-foreground"
          >
            {{ triggerLabel }}
          </span>
          <span
            :class="[studioIcons.chevronDown, 'size-3 shrink-0 text-muted-foreground/70']"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        class="p-0"
        :class="contentClass"
        :side-offset="6"
      >
      <Command>
        <CommandInput v-model="searchQuery" :placeholder="t('cms.entryPicker.search')" />
        <CommandList class="max-h-72">
          <CommandEmpty>{{ emptyLabel || t("cms.entryPicker.empty") }}</CommandEmpty>
          <CommandGroup>
            <div
              v-if="loadError"
              class="px-3 py-4 text-xs text-destructive"
            >
              {{ loadError }}
            </div>
            <div
              v-else-if="isLoading"
              class="px-3 py-4 text-xs text-muted-foreground"
            >
              {{ t("cms.entryPicker.loading") }}
            </div>
            <CommandItem
              v-for="entry in rows"
              v-else
              :key="entry.id"
              :value="`${entry.title} ${entry.slug} ${entry.id}`"
              class="gap-3"
              @pointerdown.prevent="selectEntry(entry)"
              @click.stop="selectEntry(entry)"
              @select="selectEntry(entry)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-foreground">
                  {{ entry.title }}
                </span>
                <span class="block truncate text-2xs text-muted-foreground">
                  {{ entry.slug }} · {{ t(`cms.entry.status.${entry.status}`) }} · {{ entry.locale }}
                </span>
              </span>
              <span
                v-if="entry.id === modelValue"
                :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <div
          class="flex items-center justify-between border-t border-dashed border-border/50 px-3 py-2 text-2xs text-muted-foreground"
        >
          <span>{{ t("cms.entryPicker.count", { count: total }) }}</span>
          <div v-if="totalPages > 1" class="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7! px-2 text-2xs"
              :disabled="page <= 1 || isLoading"
              @click="setPage(page - 1)"
            >
              {{ t("cms.entryPicker.previous") }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7! px-2 text-2xs"
              :disabled="page >= totalPages || isLoading"
              @click="setPage(page + 1)"
            >
              {{ t("cms.entryPicker.next") }}
            </Button>
          </div>
        </div>
      </Command>
      </PopoverContent>
    </Popover>

    <Button
      v-if="variant === 'default' && clearable && modelValue"
      type="button"
      variant="ghost"
      size="icon-xs"
      class="absolute right-7 top-1/2 z-10 size-6! -translate-y-1/2 text-muted-foreground hover:text-foreground"
      :disabled="disabled"
      :aria-label="t('cms.field.clearReference')"
      :title="t('cms.field.clearReference')"
      @pointerdown.stop
      @click="clearSelection"
    >
      <span :class="[studioIcons.close, 'size-3.5']" />
    </Button>
  </div>
</template>
