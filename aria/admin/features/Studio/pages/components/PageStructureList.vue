<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useInlineRename } from "@/features/Studio/core/composables/useInlineRename";
import { studioIcons } from "@/lib/icons";
import { getSectionIcon } from "@/lib/sectionIcons";
import { parseSectionLabel } from "../lib/sectionLabel";
import { useStudioI18n } from "@/i18n";

/**
 * Represents a single section in the page structure list.
 */
export interface SectionInfo {
  id: string;
  name: string;
  /** Section type (e.g. "hero", "features", "footer") */
  type: string;
  isVisible: boolean;
  icon?: string;
}

/**
 * Props for the PageStructureList component.
 * Displays the page structure with section rows, visibility toggles, and edit/add actions.
 */
interface Props {
  sections: SectionInfo[];
  canEdit?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
}

/**
 * Emits for user interactions with the page structure list.
 */
interface Emits {
  /** Toggle visibility of a section (show/hide) */
  "toggle-visibility": [sectionId: string];
  /** Move a section up or down in the page DSL */
  "move-section": [sectionId: string, direction: "up" | "down"];
  "rename-section": [sectionId: string, newName: string];
}

const props = withDefaults(defineProps<Props>(), {
  canEdit: true,
  isLoading: false,
  isSaving: false,
});

const emit = defineEmits<Emits>();
const { t } = useStudioI18n();

const inlineRename = useInlineRename<string>({
  commitRename: async (sectionId, newName) => {
    const parsed = parseSectionLabel(newName);
    if (!parsed.success) {
      return false;
    }
    emit("rename-section", sectionId, parsed.data);
  },
});

function canRenameSection(): boolean {
  return props.canEdit && !props.isSaving;
}

function startSectionRename(section: SectionInfo): void {
  if (!canRenameSection()) return;
  inlineRename.startRename(section.id, section.name);
}

function bindRenameInput(el: Element | { $el?: Element } | null): void {
  const node = el && "$el" in el ? el.$el : el;
  inlineRename.inputRef.value =
    node instanceof HTMLInputElement ? node : null;
}
</script>

<template>
  <section class="overflow-hidden rounded-md border border-solid border-border/50 bg-card/40">
    <div class="flex items-center justify-between gap-4 border-b border-dashed border-border px-4 py-3">
      <div class="min-w-0">
        <h2 class="m-0 text-sm font-semibold text-foreground">
          {{ t("pages.content.title") }}
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ t("pages.content.description") }}
        </p>
      </div>
      <div class="shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ sections.length === 1
          ? t("pages.content.oneSection")
          : t("pages.content.sectionCount", { count: sections.length }) }}
      </div>
    </div>

    <div v-if="isLoading" class="space-y-1 p-2">
      <div
        v-for="i in 4"
        :key="i"
        class="flex h-11 items-center justify-between rounded-sm px-2"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2.5">
          <div class="size-7 shrink-0 animate-pulse rounded-sm bg-muted/40" />
          <div class="h-3 flex-1 max-w-40 animate-pulse rounded bg-muted/40" />
        </div>
        <div class="size-7 shrink-0 animate-pulse rounded bg-muted/30" />
      </div>
    </div>

    <div v-else-if="sections.length === 0" class="px-4 py-8 text-sm text-muted-foreground">
      {{ t("pages.content.empty") }}
    </div>

    <div v-else class="divide-y divide-border/60">
      <div
        v-for="(section, index) in sections"
        :key="section.id"
        class="group/section grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sidebar/50"
      >
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-background">
            <span :class="[getSectionIcon(section.type), 'size-4 text-primary']" />
          </div>
          <div class="min-w-0">
            <div
              v-if="inlineRename.editingId.value === section.id"
              class="flex min-w-0 items-center gap-1"
            >
              <input
                :ref="bindRenameInput"
                v-model="inlineRename.editingValue.value"
                type="text"
                class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                :disabled="isSaving"
                @keydown="inlineRename.handleRenameKeydown"
                @click.stop
              />
              <Button
                type="button"
                variant="headerAction"
                size="icon-header"
                class="shrink-0 text-primary/90 hover:text-primary"
                :disabled="isSaving"
                :aria-label="t('pages.content.confirmRename')"
                @click.stop="void inlineRename.confirmRename()"
              >
                <span :class="[studioIcons.published, 'size-3.5']" />
              </Button>
              <Button
                type="button"
                variant="headerAction"
                size="icon-header"
                class="shrink-0"
                :disabled="isSaving"
                :aria-label="t('pages.content.cancelRename')"
                @click.stop="inlineRename.cancelRename()"
              >
                <span :class="[studioIcons.close, 'size-3.5']" />
              </Button>
            </div>
            <div
              v-else
              class="flex min-w-0 items-center gap-1"
            >
              <button
                type="button"
                class="min-w-0 truncate text-left text-sm font-medium text-foreground transition-colors"
                :class="canRenameSection() ? 'hover:text-primary cursor-pointer' : 'cursor-default'"
                :disabled="!canRenameSection()"
                @click.stop="startSectionRename(section)"
              >
                {{ section.name }}
              </button>
              <Button
                v-if="canRenameSection()"
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-6 shrink-0 opacity-0 transition-opacity group-hover/section:opacity-100"
                :aria-label="t('pages.content.rename')"
                @click.stop="startSectionRename(section)"
              >
                <span :class="[studioIcons.edit, 'size-3 text-muted-foreground']" />
              </Button>
            </div>
            <div class="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span class="min-w-0 truncate">{{ section.type }}</span>
              <span
                v-if="!section.isVisible"
                class="shrink-0 rounded-sm border border-border/60 px-1.5 py-0.5 text-3xs uppercase tracking-wider text-muted-foreground"
              >
                {{ t("pages.content.hidden") }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <div class="flex items-center rounded-sm border border-dashed border-border/60 bg-background/70">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-7 rounded-r-none"
              :disabled="!canEdit || isSaving || index === 0"
              :aria-label="t('pages.content.moveUp')"
              @click="emit('move-section', section.id, 'up')"
            >
              <span :class="[studioIcons.chevronUp, 'size-3.5']" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-7 rounded-l-none border-l border-dashed border-border/60"
              :disabled="!canEdit || isSaving || index === sections.length - 1"
              :aria-label="t('pages.content.moveDown')"
              @click="emit('move-section', section.id, 'down')"
            >
              <span :class="[studioIcons.chevronDown, 'size-3.5']" />
            </Button>
          </div>

          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="hidden sm:inline">
              {{ section.isVisible ? t("pages.content.visible") : t("pages.content.hidden") }}
            </span>
            <Switch
              :model-value="section.isVisible"
              :disabled="!canEdit || isSaving"
              :aria-label="section.isVisible ? t('pages.content.hide') : t('pages.content.show')"
              @update:model-value="emit('toggle-visibility', section.id)"
            />
          </label>
        </div>
      </div>
    </div>
  </section>
</template>
