<template>
  <BaseProperty
    title="Classes"
    :open="open"
    :default-open="defaultOpen"
    :header-tinted="isEditingActiveClass"
    @update:open="emit('update:open', $event)"
  >
    <template #header-title>
      <Transition name="class-header-title" mode="out-in">
        <span
          :key="classHeaderTitle"
          data-testid="classes-header-title"
          :class="[
            'class-header-title',
            isEditingActiveClass ? 'font-mono text-primary' : '',
          ]"
        >
          {{ classHeaderTitle }}
        </span>
      </Transition>
    </template>

    <template #header-actions>
      <TransitionGroup
        name="class-header-actions"
        tag="div"
        class="class-header-actions"
      >
        <button
          v-if="isEditingActiveClass"
          key="copy"
          type="button"
          class="class-header-action"
          :aria-label="t('inspector.classes.copyStyles')"
          :title="t('inspector.classes.copyStyles')"
          @click.stop.prevent="copyActiveClassStyles"
        >
          <span aria-hidden="true" :class="[studioIcons.copy, 'size-3.5']" />
        </button>
        <button
          v-if="canPasteClassStyles"
          key="paste"
          type="button"
          class="class-header-action"
          :aria-label="t('inspector.classes.pasteStyles')"
          :title="pasteClassStylesTitle"
          @click.stop.prevent="pasteClassStyles"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.clipboard, 'size-3.5']"
          />
        </button>
        <button
          v-if="isEditingActiveClass"
          key="edit-css"
          type="button"
          class="class-header-action"
          :aria-label="t('inspector.classes.editCss')"
          :title="t('inspector.classes.editCss')"
          @click.stop.prevent="openClassCssEditor"
        >
          <span aria-hidden="true" :class="[studioIcons.edit, 'size-3.5']" />
        </button>
        <button
          v-if="isEditingActiveClass"
          key="rename"
          type="button"
          class="class-header-action"
          :aria-label="t('inspector.classes.rename')"
          :title="t('inspector.classes.rename')"
          @click.stop.prevent="openActiveRenameDialog"
        >
          <span aria-hidden="true" :class="[studioIcons.rename, 'size-3.5']" />
        </button>
        <button
          v-if="isEditingActiveClass"
          key="done"
          type="button"
          class="class-header-action"
          :aria-label="t('inspector.classes.done')"
          :title="t('inspector.classes.done')"
          @click.stop.prevent="clearActiveClass"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.checkLinear, 'size-3.5']"
          />
        </button>
        <span
          v-if="isEditingActiveClass"
          key="more"
          class="class-header-action-wrap"
        >
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="class-header-action"
                :aria-label="t('inspector.classes.moreActions')"
                :title="t('inspector.classes.moreActions')"
                @click.stop.prevent
              >
                <span
                  aria-hidden="true"
                  :class="[studioIcons.moreHorizontal, 'size-3.5']"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem @select="duplicateActiveClassForElement">
                  <span :class="[studioIcons.duplicate, 'size-3.5']" />
                  <span>{{ t("inspector.classes.duplicateForElement") }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem @select="removeActiveClassFromNode">
                  <span :class="[studioIcons.unlink02, 'size-3.5']" />
                  <span>{{ t("inspector.classes.removeFromNode") }}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </TransitionGroup>
    </template>

    <div class="space-y-3">
      <Popover v-model:open="dropdownOpen">
        <PopoverAnchor class="block w-full">
          <div class="relative">
            <Input
              v-model="searchQuery"
              type="text"
              :placeholder="inputPlaceholder"
              class="h-9 pr-9 text-xs"
              @keydown.enter.prevent="handleEnter"
              @keydown.down.prevent="dropdownOpen = true"
              @focus="handleInputFocus"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              class="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              :aria-label="searchQuery ? t('inspector.classes.add') : t('inspector.classes.browse')"
              @click="handleAddButtonClick"
            >
              <span
                :class="[
                  searchQuery ? studioIcons.arrowDownRight : studioIcons.plus,
                  'size-3.5',
                ]"
              />
            </Button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          class="w-[var(--reka-popover-trigger-width)] min-w-64 max-h-92! overflow-hidden rounded-sm border border-border/60 bg-sidebar p-1.5 shadow-xl ease-out data-[state=open]:duration-150 data-[state=closed]:duration-100"
          align="start"
          side="bottom"
          :side-offset="4"
          @open-auto-focus.prevent
        >
          <div
            v-if="dropdownOpen"
            class="class-selector-menu"
            :data-view="pickerView"
          >
            <div
              v-if="isUnoEnabled && pickerView === 'grid'"
              data-panel="grid"
              class="max-h-88 overflow-y-auto"
            >
              <template v-if="filteredCustomClasses.length > 0">
                <div class="class-selector-label">
                  {{ t("inspector.classes.custom") }}
                </div>
                <div class="space-y-0.5">
                  <button
                    v-for="cls in filteredCustomClasses"
                    :key="cls.name"
                    type="button"
                    class="class-selector-row"
                    @click="selectClass(cls.name, true)"
                  >
                    <span class="font-mono">.{{ cls.name }}</span>
                    <span
                      v-if="selectedNode?.customClasses?.includes(cls.name)"
                      :class="[studioIcons.checkLinear, 'size-3.5']"
                    />
                  </button>
                </div>
              </template>

              <template v-if="isUnoEnabled">
                <div class="class-selector-label mt-1.5">
                  {{ t("inspector.classes.utilities") }}
                </div>
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="category in CLASS_CATEGORIES"
                    :key="category.id"
                    type="button"
                    class="class-selector-category"
                    @click="selectCategory(category.id)"
                  >
                    <span
                      :class="categoryIcons[category.icon]"
                      class="size-3.5 opacity-55"
                    />
                    <span>{{ category.label }}</span>
                  </button>
                </div>
              </template>
            </div>

            <div
              v-if="isUnoEnabled && pickerView === 'detail'"
              data-panel="detail"
              class="max-h-88 overflow-y-auto"
            >
              <button
                v-if="currentCategory"
                type="button"
                class="class-selector-row mb-1"
                @click="backToCategories"
              >
                <span
                  :class="[
                    studioIcons.arrowLeftLinear,
                    'size-3.5 transition-transform',
                  ]"
                />
                <span class="flex-1 text-left uppercase tracking-widest">{{
                  currentCategory.label
                }}</span>
                <span
                  class="rounded-sm bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground"
                >
                  {{ currentCategory.classes.length }}
                </span>
              </button>
              <div
                v-if="currentCategory"
                class="space-y-0.5"
              >
                <button
                  v-for="cls in currentCategory.classes"
                  :key="cls"
                  type="button"
                  class="class-selector-row font-mono"
                  @click="selectClass(cls, false)"
                >
                  {{ cls }}
                </button>
              </div>
            </div>

            <div
              v-if="pickerView === 'search'"
              data-panel="search"
              class="max-h-88 overflow-y-auto"
            >
              <div v-if="filteredCustomClasses.length > 0">
                <div class="class-selector-label">
                  {{ t("inspector.classes.custom") }}
                </div>
                <div class="space-y-0.5">
                  <button
                    v-for="cls in filteredCustomClasses"
                    :key="cls.name"
                    type="button"
                    class="class-selector-row"
                    @click="selectClass(cls.name, true)"
                  >
                    <span class="font-mono">.{{ cls.name }}</span>
                  </button>
                </div>
              </div>

              <div
                v-if="isUnoEnabled && unoSuggestions.length > 0"
                :class="{ 'mt-1.5': filteredCustomClasses.length > 0 }"
              >
                <div class="class-selector-label">
                  {{ t("inspector.classes.utilities") }}
                </div>
                <div class="space-y-0.5">
                  <button
                    v-for="suggestion in unoSuggestions"
                    :key="suggestion.value"
                    type="button"
                    class="class-selector-row"
                    @click="selectClass(suggestion.value, false)"
                  >
                    <span class="font-mono">{{ suggestion.label }}</span>
                    <span
                      v-if="suggestion.description"
                      class="ml-auto text-3xs text-muted-foreground/70"
                    >
                      {{ suggestion.description }}
                    </span>
                  </button>
                </div>
              </div>

              <div v-if="searchQuery && canCreateClass" class="mt-1.5">
                <button
                  type="button"
                  class="class-selector-row text-foreground"
                  @click="createNewClass"
                >
                  <span :class="[studioIcons.addCircleLinear, 'size-3.5']" />
                  <span>
                    Create “<span class="font-mono">{{
                      sanitizedClassName
                    }}</span
                    >”
                  </span>
                </button>
              </div>

              <div
                v-if="showNoMatches"
                class="px-3 py-6 text-center text-2xs text-muted-foreground/60"
              >
                {{ t("inspector.classes.noMatches") }}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div class="class-tag-list">
        <template v-for="cls in displayClasses" :key="cls">
          <ContextMenu v-if="isCustomClassTag(cls)">
            <ContextMenuTrigger as-child>
              <ClassTagChip
                :label="`.${cls}`"
                variant="custom"
                :active="cls === activeClassName"
                :expanded="expandedClassLabels.has(cls)"
                @click="handleClassClick(cls)"
                @contextmenu="activateClassForContextMenu(cls)"
                @remove="removeClass(cls)"
                @toggle-expand="toggleClassExpanded(cls)"
              />
            </ContextMenuTrigger>
            <ContextMenuContent class="w-48">
              <ContextMenuItem @select="copyClassStyles(cls)">
                <span :class="[studioIcons.copy, 'size-3.5']" />
                <span>{{ t("inspector.classes.context.copyStyles") }}</span>
              </ContextMenuItem>
              <ContextMenuItem
                v-if="canPasteClassStylesInto(cls)"
                @select="pasteClassStylesInto(cls)"
              >
                <span :class="[studioIcons.clipboard, 'size-3.5']" />
                <span>{{ t("inspector.classes.pasteStyles") }}</span>
              </ContextMenuItem>
              <ContextMenuSeparator class="bg-border" />
              <ContextMenuItem @select="openClassCssEditorFor(cls)">
                <span :class="[studioIcons.edit, 'size-3.5']" />
                <span>{{ t("inspector.classes.context.editCss") }}</span>
              </ContextMenuItem>
              <ContextMenuItem @select="openRenameDialog(cls)">
                <span :class="[studioIcons.rename, 'size-3.5']" />
                <span>{{ t("inspector.classes.context.rename") }}</span>
              </ContextMenuItem>
              <ContextMenuItem @select="duplicateClassForElement(cls)">
                <span :class="[studioIcons.duplicate, 'size-3.5']" />
                <span>{{ t("inspector.classes.context.duplicate") }}</span>
              </ContextMenuItem>
              <ContextMenuSeparator class="bg-border" />
              <ContextMenuItem
                variant="destructive"
                @select="removeClassFromNode(cls)"
              >
                <span :class="[studioIcons.unlink02, 'size-3.5']" />
                <span>{{ t("inspector.classes.context.remove") }}</span>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <ClassTagChip
            v-else
            :label="cls"
            variant="utility"
            :expanded="expandedClassLabels.has(cls)"
            @click="handleClassClick(cls)"
            @remove="removeClass(cls)"
            @toggle-expand="toggleClassExpanded(cls)"
          />
        </template>
      </div>

      <div v-if="rawRenderedClasses.length > 0" class="px-1 space-y-1">
        <div
          class="flex items-center gap-1 text-3xs uppercase tracking-wider text-muted-foreground/70"
        >
          <span :class="[studioIcons.eye, 'size-3']" />
          <span>{{ t("inspector.classes.legacy") }}</span>
        </div>
        <div class="flex flex-wrap gap-1">
          <ClassTagChip
            v-for="cls in rawRenderedClasses"
            :key="`raw-${cls}`"
            :label="cls"
            variant="legacy"
            @click="removeLegacyClass(cls)"
            @remove="removeLegacyClass(cls)"
          />
        </div>
        <p
          v-if="rawUtilityDependencyClasses.length > 0"
          class="text-2xs text-amber-600 dark:text-amber-400"
        >
          {{ t("inspector.classes.legacyHint") }}
        </p>
      </div>
    </div>

    <Dialog :open="renameDialogOpen" @update:open="handleRenameDialogOpen">
      <DialogContent class="sm:max-w-[420px]">
        <DialogHeader class="gap-0">
          <DialogTitle>{{ t("inspector.classes.rename") }}</DialogTitle>
          <DialogDescription>
            {{ t("inspector.classes.renameHint") }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-2">
          <Input
            v-model="renameDraft"
            placeholder="hero-button"
            @keydown.enter.prevent="submitRename"
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" @click="handleRenameDialogOpen(false)">
            {{ t("common.cancel") }}
          </Button>
          <Button :disabled="!canSubmitRename" @click="submitRename">
            {{ t("inspector.classes.rename") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ClassCssEditorDialog
      :open="classCssEditorOpen"
      :class-name="activeClassName ?? ''"
      :selector-preview="classCssSelectorPreview"
      :breakpoints="classCssBreakpoints"
      :initial-css="classCssEditorInitialValue"
      :initial-breakpoint="classCssEditorBreakpoint"
      :is-saving="isClassCssSaving"
      :error-message="classCssEditorError"
      @update:open="handleClassCssEditorOpenChange"
      @submit="handleClassCssEditorSubmit"
    />

  </BaseProperty>
</template>
<script setup lang="ts">
import { studioIcons, classCategoryIcons } from "@/lib/icons";
import { ref, computed, watch, onMounted } from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BaseProperty from "./BaseProperty.vue";
import ClassTagChip from "../components/ClassTagChip.vue";
import ClassCssEditorDialog from "../../Design/components/ClassCssEditorDialog.vue";
import { useSelectedNodeState } from "../../Core";
import { cloneDeep } from "../../Core/utils/clone";
import { useClassEditor, useAutocomplete } from "../composables";
import { useInspectorState } from "../composables/useInspectorState";
import { useAppRouter } from "../../Core/composables/useAppRouter";
import { useUtilityParser } from "../../Design/composables/useUtilityParser";
import { useClassCssEditor } from "../../Design/composables/useClassCssEditor";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import { getBreakpointIconClass } from "@/composables/breakpointIcons";
import {
  buildClassSelectorPreview,
  formatClassCssText,
} from "../../Design/lib/classManagerCss";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { createSequentialDuplicateKey } from "../../Design/lib/variableManagerKeys";
import {
  type BreakpointVariant,
  type PseudoVariant,
  createEmptyClassNames,
  CSS_CLASS_NAME_REGEX,
  mergeClassNamesForBreakpoint,
} from "../../../../lib/schemas/classEditor";
import { CLASS_CATEGORIES, getCategoryById } from "../data/classCategories";
import { useStudioI18n } from "@/i18n";

interface Props {
  mode?: "inspector" | "composer";
  defaultOpen?: boolean;
  open?: boolean;
}

withDefaults(defineProps<Props>(), {
  mode: "inspector",
  defaultOpen: true,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const { selectedNode } = useSelectedNodeState();
const { itemType, itemSlug } = useAppRouter();

const {
  customClasses,
  activeClassName,
  activeClass,
  editingMode,
  currentBreakpoint,
  error,
  loadClasses,
  createClass,
  renameClass,
  duplicateClass,
  replaceClassStyles,
  setActiveClass,
  clearActiveClass,
  addUtilityClass,
  removeUtilityClass,
  addCustomClassToNode,
  removeCustomClassFromNode,
  isCustomClass,
} = useClassEditor();

const {
  suggestions: unoSuggestions,
  search: searchUno,
  clear: clearUnoSuggestions,
} = useAutocomplete();
const { isValidUtility, isLikelyUtilityClass } = useUtilityParser();
const { utilityEngine } = useSiteSettings();
const isUnoEnabled = computed(() => utilityEngine.value === "unocss");
const { selectedPseudo } = useInspectorState();
const { activeViewports } = useCanonicalBreakpoints({ autoLoad: true });
const {
  saveClassVariantCss,
  isSaving: isClassCssSaving,
  error: classCssEditorError,
} = useClassCssEditor();

const classCssEditorOpen = ref(false);
const classCssEditorBreakpoint = ref("base");

const classCssBreakpoints = computed(() =>
  activeViewports.value
    .filter((bp) => bp.enabled || bp.id === "base")
    .map((bp) => ({
      id: bp.id,
      label: bp.label,
      icon: getBreakpointIconClass({
        id: bp.id,
        icon: bp.icon,
        width: bp.width,
      }),
    })),
);

const classCssSelectorPreview = computed(() => {
  if (!activeClassName.value) {
    return "";
  }

  return buildClassSelectorPreview(activeClassName.value, selectedPseudo.value);
});

const classCssEditorInitialValue = computed(() => {
  if (!activeClass.value) {
    return "";
  }

  return formatClassCssText(activeClass.value, {
    breakpoint: classCssEditorBreakpoint.value,
    pseudoState: selectedPseudo.value,
  });
});

const searchQuery = ref("");
const dropdownOpen = ref(false);
const expandedClassLabels = ref<Set<string>>(new Set());
const renameDialogOpen = ref(false);
const renameSourceName = ref<string | null>(null);
const renameDraft = ref("");

interface ClassStyleClipboard {
  sourceName: string;
  variants: BreakpointVariant[];
  pseudoVariants: PseudoVariant[];
  copiedAt: number;
}

const classStyleClipboard = ref<ClassStyleClipboard | null>(null);

const selectedCategory = ref<string | null>(null);

// Debounce timer for UnoCSS search
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
const ClassInputSchema = z.string().trim().min(1).max(120);
const ClassNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name");

type PickerView = "grid" | "detail" | "search";

/** Active slide view inside the class picker dropdown */
const pickerView = computed<PickerView>(() => {
  if (!isUnoEnabled.value) return "search";
  if (searchQuery.value) return "search";
  if (isUnoEnabled.value && selectedCategory.value) return "detail";
  return "grid";
});

const inputPlaceholder = computed(() =>
  currentBreakpoint.value === "base"
    ? t("inspector.classes.addOrCreate")
    : t("inspector.classes.addBreakpoint", { breakpoint: currentBreakpoint.value }),
);

const currentCategory = computed(() =>
  selectedCategory.value ? getCategoryById(selectedCategory.value) : null,
);

const categoryIcons = classCategoryIcons;

const isEditingActiveClass = computed(
  () => editingMode.value === "class" && Boolean(activeClassName.value),
);

const classHeaderTitle = computed(() =>
  isEditingActiveClass.value && activeClassName.value
    ? `.${activeClassName.value}`
    : t("inspector.section.classes"),
);

/** Classes currently on the focused node for the current breakpoint */
const displayClasses = computed<string[]>(() => {
  if (!selectedNode.value) return [];

  const node = selectedNode.value;
  const bp = currentBreakpoint.value;

  const utilityClasses = mergeClassNamesForBreakpoint(
    node.classNames ?? createEmptyClassNames(),
    bp,
  );

  const customClassRefs = node.customClasses ?? [];

  // Combine: utilities first, then custom classes
  return [...utilityClasses, ...customClassRefs];
});

const filteredCustomClasses = computed(() => {
  const all = Object.values(customClasses.value);
  if (!searchQuery.value) return all.slice(0, 10);

  const query = searchQuery.value.toLowerCase();
  return all.filter((cls) => cls.name.toLowerCase().includes(query));
});

const sanitizedClassName = computed(() => {
  return searchQuery.value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
});

const isValidRawCustomClassInput = computed(() => {
  const raw = searchQuery.value.trim().toLowerCase();
  if (!raw) return false;

  // Custom classes should be explicitly typed as slug-like names.
  // If the raw input includes utility syntax (e.g. `/`, `:`, brackets),
  // don't offer custom class creation.
  return /^[a-z0-9_-]+$/.test(raw);
});

/** Can create a new custom class with current search */
const canCreateClass = computed(() => {
  if (!isValidRawCustomClassInput.value) return false;
  if (!sanitizedClassName.value) return false;
  if (sanitizedClassName.value.length < 2) return false;

  // Don't allow if sanitization changed what user typed.
  // This avoids converting utility input into unintended custom classes.
  const raw = searchQuery.value.trim().toLowerCase();
  if (raw !== sanitizedClassName.value) return false;

  // Don't allow if already exists
  if (customClasses.value[sanitizedClassName.value]) return false;

  // When Uno is active, don't offer custom class creation for valid utilities.
  // When Uno is off, users can freely name their custom class anything (e.g. bg-black).
  if (isUnoEnabled.value) {
    if (isValidUtility(raw)) return false;
    if (
      unoSuggestions.value.some((s) => s.value === sanitizedClassName.value)
    ) {
      return false;
    }
  }

  return true;
});

const showNoMatches = computed(
  () =>
    !filteredCustomClasses.value.length &&
    (!isUnoEnabled.value || !unoSuggestions.value.length) &&
    !canCreateClass.value,
);

const canSubmitRename = computed(() => {
  const parsed = ClassNameSchema.safeParse(renameDraft.value);
  if (!parsed.success) return false;
  if (parsed.data === renameSourceName.value) return false;
  return !customClasses.value[parsed.data];
});

const canPasteClassStyles = computed(() => {
  return canPasteClassStylesInto(activeClassName.value);
});

const pasteClassStylesTitle = computed(() => {
  const sourceName = classStyleClipboard.value?.sourceName;
  return sourceName
    ? t("inspector.classes.pasteFrom", { className: sourceName })
    : t("inspector.classes.pasteStyles");
});

const rawRenderedClasses = computed<string[]>(() => {
  return [];
});

const rawUtilityDependencyClasses = computed<string[]>(() => {
  return [];
});

type BuilderCollection = "pages" | "layouts" | "components";

function getCurrentDocumentContext():
  | { collection: BuilderCollection; id: string; nodeId: string }
  | null {
  if (!selectedNode.value || !itemSlug.value) return null;

  return {
    collection: itemType.value
      ? (`${itemType.value}s` as BuilderCollection)
      : "pages",
    id: itemSlug.value,
    nodeId: selectedNode.value.id,
  };
}

function toggleClassExpanded(label: string) {
  const next = new Set(expandedClassLabels.value);
  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }
  expandedClassLabels.value = next;
}

function selectCategory(categoryId: string) {
  selectedCategory.value = categoryId;
}

/** Go back to category grid */
function backToCategories() {
  selectedCategory.value = null;
}

/** Reset category browser when dropdown closes */
watch(dropdownOpen, (isOpen) => {
  if (!isOpen) {
    selectedCategory.value = null;
  }
});

watch(searchQuery, () => {
  handleSearchInput();
});

watch(displayClasses, (classes) => {
  const visible = new Set(classes);
  const next = new Set(
    [...expandedClassLabels.value].filter((label) => visible.has(label)),
  );
  if (next.size !== expandedClassLabels.value.size) {
    expandedClassLabels.value = next;
  }
});

function handleSearchInput() {
  // Reset category selection when typing
  if (searchQuery.value) {
    selectedCategory.value = null;
  }

  if (searchDebounce) clearTimeout(searchDebounce);

  if (searchQuery.value.length >= 2) {
    dropdownOpen.value = true;
    if (isUnoEnabled.value) {
      searchDebounce = setTimeout(() => {
        searchUno(searchQuery.value);
      }, 100);
    }
  } else {
    clearUnoSuggestions();
  }
}

function handleInputFocus() {
  dropdownOpen.value = true;
}

async function handleAddButtonClick() {
  if (searchQuery.value.trim()) {
    await handleEnter();
    return;
  }

  dropdownOpen.value = true;
}

function hasUnbalancedPairs(value: string): boolean {
  let squareDepth = 0;
  let parenDepth = 0;

  for (const char of value) {
    if (char === "[") squareDepth += 1;
    if (char === "]") squareDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;

    if (squareDepth < 0 || parenDepth < 0) return true;
  }

  return squareDepth !== 0 || parenDepth !== 0;
}

/** Handle Enter key - add class or create new */
async function handleEnter() {
  const parsedValue = ClassInputSchema.safeParse(searchQuery.value);
  if (!parsedValue.success) return;

  const value = parsedValue.data;

  // If there's a matching suggestion, use it
  const matchingSuggestion = unoSuggestions.value.find(
    (s) => s.value.toLowerCase() === value.toLowerCase(),
  );

  if (!matchingSuggestion && hasUnbalancedPairs(value)) {
    toast.info("Finish the arbitrary value", {
      description: "Example: bg-[rgb(59_130_246_/_20%)]",
      duration: 2500,
    });
    return;
  }

  // - opacity slash without value: bg-blue-500/
  // - variant/pseudo chain without utility: hover:, md:hover:, dark:focus:
  if (!matchingSuggestion && (value.endsWith("/") || value.endsWith(":"))) {
    const isOpacity = value.endsWith("/");
    toast.info(
      isOpacity ? "Finish the opacity value" : "Finish the utility class",
      {
        description: isOpacity
          ? "Example: bg-blue-500/20"
          : "Example: hover:bg-blue-500/20",
        duration: 2500,
      },
    );
    return;
  }

  if (isUnoEnabled.value && matchingSuggestion) {
    await selectClass(matchingSuggestion.value, false);
  } else if (isUnoEnabled.value && isValidUtility(value)) {
    await selectClass(value, false);
  } else if (canCreateClass.value) {
    await createNewClass();
  } else if (isUnoEnabled.value) {
    // Fallback: add as utility class (Uno only)
    await selectClass(value, false);
  }
}

async function selectClass(className: string, isCustom: boolean) {
  const context = getCurrentDocumentContext();
  if (!context) return;

  if (isCustom) {
    await addCustomClassToNode(
      context.collection,
      context.id,
      context.nodeId,
      className,
    );
    setActiveClass(className);
  } else {
    await addUtilityClass(
      context.collection,
      context.id,
      context.nodeId,
      className,
      currentBreakpoint.value,
    );
  }

  searchQuery.value = "";
  dropdownOpen.value = false;
  clearUnoSuggestions();
}

async function removeClass(className: string) {
  const context = getCurrentDocumentContext();
  if (!context) return;

  if (isCustomClassTag(className)) {
    await removeCustomClassFromNode(
      context.collection,
      context.id,
      context.nodeId,
      className,
    );
  } else {
    // removeUtilityClass will smart-resolve the correct key where the class exists
    await removeUtilityClass(
      context.collection,
      context.id,
      context.nodeId,
      className,
      currentBreakpoint.value,
    );
  }
}

async function removeLegacyClass(_className: string) {
  // Legacy className/props.class/props.className have been removed
  // from the type system. This is a no-op.
}

function isCustomClassTag(className: string): boolean {
  if (isLikelyUtilityClass(className)) return false;
  if (isCustomClass(className)) return true;
  return selectedNode.value?.customClasses?.includes(className) ?? false;
}

function handleClassClick(className: string) {
  if (!isCustomClassTag(className)) return;

  // Toggle active state for custom classes
  if (activeClassName.value === className) {
    clearActiveClass();
  } else {
    setActiveClass(className);
  }
}

function activateClassForContextMenu(className: string) {
  setActiveClass(className);
}

async function createNewClass() {
  if (!canCreateClass.value) return;

  const name = sanitizedClassName.value;
  const success = await createClass(name);

  const context = getCurrentDocumentContext();
  if (success && context) {
    // Also add to current node
    await addCustomClassToNode(
      context.collection,
      context.id,
      context.nodeId,
      name,
    );

    // Set as active for immediate editing
    setActiveClass(name);
  }

  searchQuery.value = "";
  dropdownOpen.value = false;
  clearUnoSuggestions();
}

function openRenameDialog(className: string) {
  renameSourceName.value = className;
  renameDraft.value = className;
  renameDialogOpen.value = true;
}

function openActiveRenameDialog() {
  const className = activeClassName.value;
  if (!className) return;

  openRenameDialog(className);
}

function handleRenameDialogOpen(open: boolean) {
  renameDialogOpen.value = open;
  if (!open) {
    renameSourceName.value = null;
    renameDraft.value = "";
  }
}

async function submitRename() {
  const sourceName = renameSourceName.value;
  const parsedName = ClassNameSchema.safeParse(renameDraft.value);
  if (!sourceName || !parsedName.success || !canSubmitRename.value) return;

  const success = await renameClass(sourceName, parsedName.data);
  if (!success) {
    toast.error(error.value ?? `Failed to rename ${sourceName}`);
    return;
  }

  toast.success(`Renamed .${sourceName} to .${parsedName.data}`);
  handleRenameDialogOpen(false);
}

async function duplicateClassForElement(className: string) {
  const context = getCurrentDocumentContext();
  const nextName = createSequentialDuplicateKey(
    className,
    Object.keys(customClasses.value),
  );

  const duplicated = await duplicateClass(className, nextName);
  if (!duplicated) {
    toast.error(error.value ?? `Failed to duplicate ${className}`);
    return;
  }

  if (context) {
    await addCustomClassToNode(
      context.collection,
      context.id,
      context.nodeId,
      nextName,
    );
    await removeCustomClassFromNode(
      context.collection,
      context.id,
      context.nodeId,
      className,
    );
  }

  setActiveClass(nextName);
  toast.success(`Duplicated .${className} to .${nextName}`);
}

function openClassCssEditorFor(className: string): void {
  setActiveClass(className);
  classCssEditorBreakpoint.value = currentBreakpoint.value;
  classCssEditorOpen.value = true;
}

function openClassCssEditor(): void {
  const className = activeClassName.value;
  if (!className) return;

  openClassCssEditorFor(className);
}

function handleClassCssEditorOpenChange(value: boolean): void {
  classCssEditorOpen.value = value;
}

async function handleClassCssEditorSubmit(payload: {
  cssText: string;
  breakpoint: string;
}): Promise<void> {
  const className = activeClassName.value;
  if (!className) {
    return;
  }

  const success = await saveClassVariantCss({
    className,
    cssText: payload.cssText,
    breakpoint: payload.breakpoint,
    pseudoState: selectedPseudo.value,
    preserveActiveClass: true,
  });

  if (!success) {
    toast.error(classCssEditorError.value ?? `Failed to update ${className}`);
    return;
  }

  toast.success(`Updated CSS for .${className}`);
  classCssEditorOpen.value = false;
}

async function duplicateActiveClassForElement() {
  const className = activeClassName.value;
  if (!className) return;

  await duplicateClassForElement(className);
}

function copyClassStyles(className: string) {
  const classDef = customClasses.value[className];
  if (!classDef) {
    toast.error(`Class ".${className}" was not found`);
    return;
  }

  classStyleClipboard.value = {
    sourceName: className,
    variants: cloneDeep(classDef.variants),
    pseudoVariants: cloneDeep(classDef.pseudoVariants),
    copiedAt: Date.now(),
  };

  toast.success(`Copied .${className} styles`);
}

function copyActiveClassStyles() {
  const className = activeClassName.value;
  if (!className) return;

  copyClassStyles(className);
}

function canPasteClassStylesInto(targetName: string | null): boolean {
  const clipboard = classStyleClipboard.value;
  if (!clipboard || !targetName) return false;
  if (clipboard.sourceName === targetName) return false;
  return Boolean(customClasses.value[targetName]);
}

async function pasteClassStylesInto(targetName: string) {
  const clipboard = classStyleClipboard.value;
  if (!clipboard || !canPasteClassStylesInto(targetName)) return;

  const success = await replaceClassStyles(
    targetName,
    cloneDeep(clipboard.variants),
    cloneDeep(clipboard.pseudoVariants),
  );
  if (!success) {
    toast.error(error.value ?? `Failed to paste styles into ${targetName}`);
    return;
  }

  toast.success(`Pasted .${clipboard.sourceName} styles into .${targetName}`);
}

async function pasteClassStyles() {
  const targetName = activeClassName.value;
  if (!targetName) return;

  await pasteClassStylesInto(targetName);
}

async function removeClassFromNode(className: string) {
  await removeClass(className);
  if (activeClassName.value === className) {
    clearActiveClass();
  }
}

async function removeActiveClassFromNode() {
  const className = activeClassName.value;
  if (!className) return;

  await removeClassFromNode(className);
}

onMounted(async () => {
  await loadClasses();
});
</script>

<style scoped>
.class-header-title {
  display: inline-flex;
  min-width: 0;
  max-width: 11rem;
  overflow: hidden;
  align-items: center;
  letter-spacing: 0;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  will-change: opacity, transform, filter;
}

.class-header-title-enter-active {
  transition:
    opacity 170ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 170ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 170ms cubic-bezier(0.16, 1, 0.3, 1);
}

.class-header-title-leave-active {
  transition:
    opacity 120ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 120ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.class-header-title-enter-from {
  opacity: 0;
  transform: translateY(-4px);
  filter: blur(2px);
}

.class-header-title-leave-to {
  opacity: 0;
  transform: translateY(2px);
  filter: blur(1px);
}

.class-header-actions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.125rem;
}

.class-header-action {
  display: inline-flex;
  width: 1.375rem;
  height: 1.375rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  transition:
    background-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease;
  will-change: opacity, transform;
}

.class-header-action-wrap {
  display: inline-flex;
  flex-shrink: 0;
  will-change: opacity, transform;
}

.class-header-action:hover,
.class-header-action:focus-visible {
  background: color-mix(in srgb, var(--sidebar) 74%, var(--primary) 14%);
  color: var(--foreground);
  outline: none;
}

.class-header-actions-enter-active {
  transition:
    opacity 170ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 170ms cubic-bezier(0.16, 1, 0.3, 1);
}

.class-header-actions-leave-active {
  transition:
    opacity 100ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.class-header-actions-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.class-header-actions-leave-to {
  opacity: 0;
  transform: translateX(6px);
}

.class-header-actions-enter-active:nth-child(2) {
  transition-delay: 24ms;
}

.class-header-actions-enter-active:nth-child(3) {
  transition-delay: 48ms;
}

.class-header-actions-enter-active:nth-child(4) {
  transition-delay: 72ms;
}

.class-selector-menu {
  min-width: 0;
}

.class-selector-label {
  padding: 0.375rem 0.5rem 0.25rem;
  color: color-mix(in srgb, var(--muted-foreground) 78%, transparent);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.class-selector-row {
  display: flex;
  width: 100%;
  min-height: 2rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  padding: 0.4375rem 0.5rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: left;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.class-selector-row:hover,
.class-selector-row:focus-visible {
  background: color-mix(in srgb, var(--sidebar) 72%, var(--primary) 10%);
  color: var(--foreground);
  outline: none;
}

.class-selector-category {
  display: inline-flex;
  min-width: 0;
  height: 2rem;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--radius-sm);
  padding: 0 0.5rem;
  color: var(--muted-foreground);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.class-selector-category:hover,
.class-selector-category:focus-visible {
  background: color-mix(in srgb, var(--sidebar) 72%, var(--primary) 10%);
  color: var(--foreground);
  outline: none;
}

.class-tag-list {
  display: flex;
  min-height: 1.625rem;
  flex-wrap: wrap;
  gap: 0.375rem;
}

@media (prefers-reduced-motion: reduce) {
  .class-header-title-enter-active,
  .class-header-title-leave-active,
  .class-header-actions-enter-active,
  .class-header-actions-leave-active {
    transition-duration: 1ms;
  }

  .class-header-title-enter-from,
  .class-header-title-leave-to,
  .class-header-actions-enter-from,
  .class-header-actions-leave-to {
    transform: none;
    filter: none;
  }
}
</style>
