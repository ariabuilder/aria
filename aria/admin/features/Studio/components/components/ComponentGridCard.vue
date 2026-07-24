<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { studioIcons } from "@/lib/icons";
import type { Component } from "@/composables/useBuilderData";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { isComponentThumbnailQueued } from "../composables/componentThumbnailBackgroundQueue";
import ComponentThumbnailPreview from "./ComponentThumbnailPreview.vue";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    component: Component;
    isRenaming: boolean;
    editingTitle: string;
    canEditInComposer: boolean;
    draggable?: boolean;
    isThumbnailPending?: boolean;
    thumbnailRefreshToken?: string | null;
  }>(),
  {
    draggable: false,
    isThumbnailPending: false,
    thumbnailRefreshToken: null,
  },
);

const emit = defineEmits<{
  open: [];
  editInComposer: [];
  rename: [];
  duplicate: [];
  delete: [];
  updateEditingTitle: [value: string];
  confirmRename: [];
  cancelRename: [];
  renameKeydown: [event: KeyboardEvent];
  dragstart: [event: DragEvent];
  dragend: [];
}>();
const { t } = useStudioI18n();

const showThumbnailPending = computed(
  () =>
    props.isThumbnailPending ||
    isComponentThumbnailQueued(props.component.id),
);

const thumbnailUrl = computed(() =>
  typeof props.component.thumbnailUrl === "string"
    ? props.component.thumbnailUrl
    : null,
);

type RenameInputRef =
  | HTMLInputElement
  | (ComponentPublicInstance & { $el?: HTMLInputElement });

const renameInputRef = ref<RenameInputRef | null>(null);

function setRenameInputRef(
  value: Element | ComponentPublicInstance | null,
): void {
  if (value instanceof HTMLInputElement) {
    renameInputRef.value = value;
    return;
  }
  renameInputRef.value = value as
    | (ComponentPublicInstance & { $el?: HTMLInputElement })
    | null;
}

const renameModel = computed({
  get: () => props.editingTitle,
  set: (value: string | number) => emit("updateEditingTitle", String(value)),
});

const lastEditedLabel = computed(() => {
  if (!props.component.updatedAt) {
    return null;
  }

  return formatRelativeTime(props.component.updatedAt);
});

const categoryLabel = computed(
  () => props.component.category?.trim() || null,
);

watch(
  () => props.isRenaming,
  async (renaming) => {
    if (!renaming) return;
    await nextTick();
    const inputElement =
      renameInputRef.value instanceof HTMLInputElement
        ? renameInputRef.value
        : renameInputRef.value?.$el;
    if (!inputElement) return;
    inputElement.focus();
    inputElement.select();
  },
);

const previewActions = computed(
  () =>
    [
      {
        key: "edit",
        icon: studioIcons.edit,
        label: t("pages.action.editInComposer"),
        disabled: !props.canEditInComposer,
        handler: () => emit("editInComposer"),
      },
      {
        key: "open",
        icon: studioIcons.settings,
        label: t("components.action.openDetails"),
        disabled: false,
        handler: () => emit("open"),
      },
    ] as const,
);
</script>

<template>
  <div
    class="group relative z-0 isolate"
    :class="draggable ? 'cursor-grab active:cursor-grabbing' : ''"
    :draggable="draggable"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <article
      class="group cursor-pointer overflow-hidden rounded-lg border border-solid border-border/50 bg-card/80 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border hover:shadow-md"
      @click="emit('open')"
    >
      <div
        class="relative aspect-video overflow-hidden bg-muted/25"
        data-organizer-drag-preview
      >
        <ComponentThumbnailPreview
          class="absolute inset-0"
          :component-id="component.id"
          :thumbnail-url="thumbnailUrl"
          :thumbnail-refresh-token="thumbnailRefreshToken"
          :updated-at="component.updatedAt"
          suppress-live-fallback
          thumbnail-fit="cover"
        />

        <!-- Actions menu (top-right, hover-only) -->
        <div
          class="preview-actions absolute right-3 top-3 z-30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          @click.stop
        >
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="sidebar-action" size="icon-sm" class="shrink-0 w-8! h-8!">
                <span
                  :class="[studioIcons.moreHorizontal, 'size-4! p-0! shrink-0']"
                />
                <span class="sr-only">{{ t("components.actions") }}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40" @click.stop>
              <DropdownMenuItem @click="emit('rename')">
                <span :class="[studioIcons.rename, 'w-4 h-4 mr-2']" />
                {{ t("pages.action.rename") }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="emit('duplicate')">
                <span :class="[studioIcons.duplicate, 'w-4 h-4 mr-2']" />
                {{ t("pages.action.duplicate") }}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" @click="emit('delete')">
                <span :class="[studioIcons.trashBin, 'w-4 h-4 mr-2']" />
                {{ t("common.delete") }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <!-- Hover action overlay -->
        <div
          class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        >
          <div
            class="action-overlay flex items-center gap-1 rounded-lg border border-dashed border-border bg-input p-0.5 opacity-0 translate-y-2.5 scale-92 shadow-xs backdrop-blur-md transition duration-200 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
          >
            <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
              <Tooltip v-for="action in previewActions" :key="action.key">
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="card-action-primary"
                    size="icon"
                    class="pointer-events-auto size-8!"
                    :class="action.disabled ? 'cursor-wait opacity-60' : ''"
                    :aria-label="action.label"
                    :disabled="action.disabled"
                    @click.stop="action.handler()"
                  >
                    <span
                      :class="[action.icon, 'size-4.5 shrink-0']"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {{ action.label }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div
          v-if="showThumbnailPending"
          class="absolute inset-0 z-10 flex items-center justify-center bg-muted/60 backdrop-blur-[1px]"
        >
          <span
            :class="[studioIcons.loading, 'size-5 animate-spin text-muted-foreground']"
            aria-hidden="true"
          />
        </div>
      </div>

      <div class="space-y-2 p-3.5">
        <template v-if="isRenaming">
          <div class="flex min-w-0 items-center gap-2">
            <Input
              :ref="setRenameInputRef"
              v-model="renameModel"
              plain
              :placeholder="t('components.namePlaceholder')"
              spellcheck="false"
              class="h-5! min-w-0 flex-1 border-0 bg-transparent p-0 text-sm! font-medium leading-5 text-foreground caret-primary outline-none"
              @keydown="emit('renameKeydown', $event)"
              @click.stop
            />
            <div
              class="flex shrink-0 items-center gap-2"
              @click.stop
              @dblclick.stop
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-4! p-0! text-muted-foreground hover:text-emerald-500"
                :aria-label="t('components.confirmRename')"
                @mousedown.prevent="emit('confirmRename')"
              >
                <span
                  :class="[studioIcons.check, 'size-4 shrink-0']"
                  aria-hidden="true"
                />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-4! p-0! text-muted-foreground hover:text-destructive"
                :aria-label="t('components.cancelRename')"
                @mousedown.prevent="emit('cancelRename')"
              >
                <span
                  :class="[studioIcons.close, 'size-4 shrink-0']"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </template>

        <template v-else>
          <h2 class="m-0 min-w-0 truncate text-sm font-medium capitalize text-foreground">
            {{ component.name || component.id }}
          </h2>

          <div
            class="flex min-w-0 items-center justify-between gap-3 text-2xs text-muted-foreground"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5 truncate">
              <span
                v-if="categoryLabel"
                class="truncate rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5"
              >
                {{ categoryLabel }}
              </span>
            </div>

            <span v-if="lastEditedLabel" class="shrink-0 tabular-nums">
              {{ lastEditedLabel }}
            </span>
          </div>
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.preview-actions :deep(button) {
  background-color: color-mix(in oklch, var(--sidebar) 88%, transparent) !important;
  backdrop-filter: blur(4px);
  border-color: color-mix(in oklch, var(--border) 65%, transparent) !important;
}

.preview-actions :deep(button:hover),
.preview-actions :deep(button[data-state="open"]) {
  background-color: var(--sidebar) !important;
  border-color: var(--border) !important;
  border-style: solid !important;
  color: var(--foreground) !important;
}

@media (hover: none) {
  .action-overlay {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .preview-actions {
    opacity: 1;
  }
}
</style>
