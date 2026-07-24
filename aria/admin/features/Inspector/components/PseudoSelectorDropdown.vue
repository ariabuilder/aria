<script setup lang="ts">
/**
 * PseudoSelectorDropdown - Custom Class Pseudo-State Picker
 *
 * Slide-panel popover for selecting semantic class pseudo-states.
 *
 * @component
 */
import { computed, ref, watch } from "vue";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { studioIcons, pseudoCategoryIcons } from "@/lib/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type InspectorPseudoState,
  type PseudoPresetId,
  InspectorPseudoStateSchema,
  filterPseudoPresets,
  formatPseudoStateLabel,
  parseCustomPseudoInput,
} from "../../../../lib/styles/pseudoSelectors";
import {
  PSEUDO_CATEGORIES,
  type PseudoCategoryId,
  getPseudoCategoryById,
} from "../data/pseudoCategories";

interface Props {
  modelValue: InspectorPseudoState;
  disabled?: boolean;
  hasPseudoRules?: boolean;
  disabledMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  hasPseudoRules: false,
  disabledMessage: "Select a custom class to enable pseudo states",
});

const emit = defineEmits<{
  "update:modelValue": [value: InspectorPseudoState];
}>();

const PseudoPickerViewSchema = z.enum(["grid", "detail", "search"]);
type PseudoPickerView = z.infer<typeof PseudoPickerViewSchema>;

const open = ref(false);
const searchQuery = ref("");
const selectedCategoryId = ref<PseudoCategoryId | null>(null);
const customInputError = ref<string | null>(null);
const animating = ref(false);

const isActive = computed(() => props.modelValue !== "default");

const pickerView = computed<PseudoPickerView>(() => {
  if (searchQuery.value.trim()) return "search";
  if (selectedCategoryId.value) return "detail";
  return "grid";
});

const currentCategory = computed(() =>
  selectedCategoryId.value
    ? getPseudoCategoryById(selectedCategoryId.value)
    : null,
);

const filteredPresets = computed(() => filterPseudoPresets(searchQuery.value));

const parsedCustomInput = computed(() => {
  if (!searchQuery.value.trim()) return null;
  return parseCustomPseudoInput(searchQuery.value);
});

const canApplyCustomPseudo = computed(
  () => parsedCustomInput.value?.success === true,
);

watch(open, (isOpen) => {
  if (!isOpen) {
    searchQuery.value = "";
    selectedCategoryId.value = null;
    customInputError.value = null;
  }
});

function staggerChipIndex(index: number): number {
  return index;
}

function selectCategory(id: PseudoCategoryId) {
  selectedCategoryId.value = id;
}

function backToCategories() {
  selectedCategoryId.value = null;
}

function selectPseudo(value: InspectorPseudoState) {
  const parsed = InspectorPseudoStateSchema.safeParse(value);
  if (!parsed.success || props.disabled) {
    return;
  }

  emit("update:modelValue", parsed.data);
  open.value = false;

  if (value !== "default") {
    animating.value = true;
    setTimeout(() => {
      animating.value = false;
    }, 600);
  }
}

function selectPreset(id: PseudoPresetId) {
  selectPseudo(id);
}

function applyCustomPseudo() {
  const parsed = parseCustomPseudoInput(searchQuery.value);
  if (!parsed.success) {
    customInputError.value =
      parsed.error.issues[0]?.message ?? "Invalid pseudo selector";
    return;
  }

  customInputError.value = null;
  selectPseudo(parsed.data);
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && canApplyCustomPseudo.value) {
    event.preventDefault();
    applyCustomPseudo();
  }
}
</script>

<template>
  <TooltipProvider v-if="disabled">
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="inline-flex shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="true"
            class="h-7 w-7 shrink-0 rounded-sm p-0"
            :class="[
              isActive ? 'text-primary' : 'text-foreground',
              'opacity-90',
            ]"
            title="Custom class pseudo states"
          >
            <div :class="[studioIcons.pseudoState, 'size-4.5']" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{ disabledMessage }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>

  <Popover v-model:open="open">
    <template v-if="!disabled">
      <PopoverTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          :disabled="disabled"
          class="h-7 w-7 shrink-0 rounded-sm p-0"
          :class="[
            isActive ? 'text-primary' : 'text-muted-foreground',
            disabled ? 'opacity-55' : '',
          ]"
          title="Custom class pseudo states"
        >
          <div
            :class="[
              studioIcons.pseudoState,
              'size-4.5',
              animating ? 'animate-pseudo-spin' : '',
            ]"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        :side-offset="8"
        class="w-66 max-h-100! overflow-hidden rounded-sm p-2 shadow-xl border border-border/80 ease-out data-[state=open]:duration-150 data-[state=closed]:duration-100"
        @open-auto-focus.prevent
      >
        <button
          type="button"
          class="mb-2 flex w-full cursor-pointer items-center rounded-sm justify-between px-3 py-1.5 text-center text-xs transition-colors hover:bg-primary/50 hover:text-primary-foreground focus:bg-primary/20 focus:text-primary-foreground border border-primary/10 hover:border-primary/20 focus:border-primary/20"
          :class="
            modelValue === 'default'
              ? 'bg-primary/20 text-primary-foreground'
              : 'text-muted-foreground'
          "
          @click="selectPseudo('default')"
        >
          <span class="font-regular">Return to normal state</span>
        </button>

        <div class="mb-2">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search or type :has(.icon)..."
            class="h-8 w-full rounded-sm! border border-border/50 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
            @keydown="handleSearchKeydown"
          />
        </div>

        <div
          class="slide-panel-root slide-panel-root--pseudo-picker"
          :data-view="pickerView"
        >
          <!-- Category Grid -->
          <div data-panel="grid" class="slide-panel overflow-y-auto">
            <div class="grid grid-cols-1 gap-1.5 px-0 py-1.5">
              <button
                v-for="category in PSEUDO_CATEGORIES"
                :key="category.id"
                type="button"
                class="class-picker-category flex items-center gap-2 px-2 py-2 text-xs rounded-sm border border-transparent bg-card/50 transition-all tracking-widest text-muted-foreground hover:border-dashed hover:text-foreground hover:border-primary/50 hover:bg-primary/20 group/category"
                @click="selectCategory(category.id)"
              >
                <span
                  :class="pseudoCategoryIcons[category.icon]"
                  class="class-picker-category-icon size-3.5 opacity-50 group-hover/category:opacity-100 transition-all"
                />
                <span>{{ category.label }}</span>
              </button>
            </div>
          </div>

          <!-- Category Detail -->
          <div data-panel="detail" class="slide-panel overflow-y-auto">
            <button
              v-if="currentCategory"
              type="button"
              class="class-picker-back w-full flex items-center gap-1.5 px-2 py-2 text-2xs text-muted-foreground uppercase font-mono hover:text-primary transition-colors group/back"
              @click="backToCategories"
            >
              <span
                :class="[
                  studioIcons.arrowLeftLinear,
                  'size-3 transition-transform group-hover/back:-translate-x-0.5',
                ]"
              />
              <span class="flex-1 text-left">{{ currentCategory.label }}</span>
              <span
                class="rounded-sm bg-primary/30 px-1.5 py-0.5 text-3xs normal-case tracking-normal text-primary-foreground/80"
              >
                {{ currentCategory.states.length }}
              </span>
            </button>
            <div
              v-if="currentCategory"
              class="flex flex-wrap gap-1.5 px-2 py-1.5"
            >
              <button
                v-for="(state, index) in currentCategory.states"
                :key="state"
                type="button"
                class="class-picker-chip px-2 py-1.5 text-2xs border border-transparent font-mono rounded-sm bg-muted hover:bg-primary/30 hover:text-foreground/90 text-muted-foreground transition-all hover:border-dashed hover:border-primary/50"
                :class="
                  modelValue === state
                    ? 'border-primary/80 border-dashed bg-primary/20 text-primary-foreground'
                    : ''
                "
                :style="{ '--chip-index': staggerChipIndex(index) }"
                @click="selectPreset(state)"
              >
                {{ formatPseudoStateLabel(state) }}
              </button>
            </div>
          </div>

          <!-- Search Results -->
          <div data-panel="search" class="slide-panel overflow-y-auto">
            <div v-if="filteredPresets.length > 0" class="p-0.5">
              <div
                class="px-2 pt-1 pb-1.5 text-xs font-mono tracking-widest uppercase text-muted-foreground/70"
              >
                Presets
              </div>
              <div class="flex flex-col gap-0.5 px-1 pb-1">
                <button
                  v-for="(preset, index) in filteredPresets"
                  :key="preset.id"
                  type="button"
                  class="class-picker-chip class-picker-search-row w-full flex items-center rounded-sm border border-transparent px-2 py-1.5 text-left transition-all hover:border-dashed hover:border-primary/40 hover:bg-primary/15"
                  :class="
                    modelValue === preset.id
                      ? 'border-primary/80 border-dashed bg-primary/20'
                      : ''
                  "
                  :style="{ '--chip-index': staggerChipIndex(index) }"
                  @click="selectPreset(preset.id)"
                >
                  <span class="font-mono text-2xs text-foreground/90">{{
                    preset.suffix
                  }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="searchQuery.trim()"
              class="p-0.5"
              :class="{
                'border-t border-dashed border-border/50':
                  filteredPresets.length > 0,
              }"
            >
              <div
                class="px-2 pt-1 pb-1.5 text-xs font-mono tracking-widest uppercase text-muted-foreground/70"
              >
                Custom
              </div>
              <button
                type="button"
                class="class-picker-chip class-picker-search-row mx-1 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-sm border border-transparent px-2 py-1.5 text-left transition-all hover:border-dashed hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canApplyCustomPseudo"
                @click="applyCustomPseudo"
              >
                <span class="font-mono text-2xs text-foreground/90">
                  Apply {{ searchQuery.trim() }}
                </span>
              </button>
              <p
                v-if="customInputError"
                class="px-2 pt-1 text-3xs text-destructive"
              >
                {{ customInputError }}
              </p>
              <p
                v-else-if="!canApplyCustomPseudo"
                class="px-2 pt-1 text-3xs text-muted-foreground"
              >
                Use has(), not(), is(), or where() — e.g. has(.icon)
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </template>
  </Popover>
</template>

<style scoped>
@keyframes pseudo-spin {
  0% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(380deg);
  }
  70% {
    transform: rotate(350deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.animate-pseudo-spin {
  animation: pseudo-spin 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
