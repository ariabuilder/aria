<script setup lang="ts">
import type { EditableItemType } from "@/features/Core/types/router";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
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
import { inject, ref, toRef, watch } from "vue";
import { APP_INJECTION_KEYS } from "@/features/Core/types/injectionKeys";
import { useComposerQuickSwitch } from "../composables/useComposerQuickSwitch";
import { useCmsCommandPaletteEntries } from "@/features/Studio/search/composables/useCmsCommandPaletteEntries";
import { setCmsEntryNavigationPreview } from "@/features/CMS/lib/cmsNavigationPreview";
import {
  quickSwitchTargetForOption,
  type QuickSwitchOption,
} from "../schemas/quickSwitch";
import { useRouter } from "vue-router";

const props = withDefaults(
  defineProps<{
    availablePages?: readonly unknown[];
    availableLayouts?: readonly unknown[];
    availableComponents?: readonly unknown[];
    currentItemSlug?: string;
    currentItemType?: EditableItemType;
    currentPageTitle?: string;
    currentLayoutName?: string;
    hasUnsavedChanges?: boolean;
  }>(),
  {
    availablePages: () => [],
    availableLayouts: () => [],
    availableComponents: () => [],
    currentItemSlug: "",
    hasUnsavedChanges: false,
  },
);
const { t } = useStudioI18n();
const router = useRouter();
const searchQuery = ref("");
const cmsSearch = useCmsCommandPaletteEntries(searchQuery);

const emit = defineEmits<{
  "select-page": [slug: string];
  "select-layout": [slug: string];
  "select-component": [slug: string];
}>();

const ensureDraftSaved = inject(APP_INJECTION_KEYS.ensureDraftSaved, undefined);

const {
  isOpen,
  open,
  close,
  groups,
  hasOptions,
  currentValue,
  placeholder,
  editingLabel,
  editingIcon,
  handleSelect,
} = useComposerQuickSwitch({
  availablePages: toRef(props, "availablePages"),
  availableLayouts: toRef(props, "availableLayouts"),
  availableComponents: toRef(props, "availableComponents"),
  availableCmsEntries: cmsSearch.visibleEntries,
  currentItemSlug: toRef(props, "currentItemSlug"),
  currentItemType: toRef(props, "currentItemType"),
  currentPageTitle: toRef(props, "currentPageTitle"),
  currentLayoutName: toRef(props, "currentLayoutName"),
  hasUnsavedChanges: toRef(props, "hasUnsavedChanges"),
  ensureSaved: ensureDraftSaved,
  onSelectPage: (slug) => emit("select-page", slug),
  onSelectLayout: (slug) => emit("select-layout", slug),
  onSelectComponent: (slug) => emit("select-component", slug),
  onSelectCmsEntry: async (target) => {
    setCmsEntryNavigationPreview({
      id: target.itemId,
      collectionId: target.collectionId,
      collectionName: target.collectionName,
      title: target.title,
      slug: target.slug,
      status: target.status,
    });
    await router.push({
      name: "cms-entry-detail",
      params: {
        name: target.collectionName,
        entrySlugOrId: target.slug,
      },
      query: { locale: target.locale },
    });
  },
});

watch(isOpen, (open) => {
  if (!open) {
    searchQuery.value = "";
  }
});

function selectOption(option: QuickSwitchOption): void {
  void handleSelect(quickSwitchTargetForOption(option));
}

defineExpose({ open, close });
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex min-w-0 flex-1 py-1.5 items-center gap-1.5 rounded-sm! px-1 -mx-1 text-left transition-colors hover:bg-card disabled:cursor-default cursor-pointer disabled:hover:bg-transparent focus:outline-none focus:ring-0 hover:border-dashed hover:border-border hover:border-solid border border-transparent data-[state=open]:border-border data-[state=open]:bg-card/80 data-[state=open]:border-dashed data-[state=open]:hover:border-dashed"
        :disabled="!hasOptions"
      >
        <div
          class="w-4 h-4 rounded-sm flex items-center justify-center shrink-0 bg-transparent text-primary"
        >
          <div :class="[editingIcon, 'w-4 h-4 text-muted-foreground']" />
        </div>
        <span
          class="text-xs font-medium text-muted-foreground capitalize truncate min-w-0 tracking-wide flex-1"
          >{{ editingLabel }}</span
        >
        <span
          v-if="hasOptions"
          :class="[studioIcons.chevronDown, 'size-3.5 shrink-0 text-muted-foreground/70']"
        />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-60 p-0" :side-offset="8">
      <Command>
        <CommandInput v-model="searchQuery" auto-focus :placeholder="placeholder"/>
        <CommandList>
          <CommandEmpty>
            {{
              cmsSearch.isLoading.value
                ? t("commandSearch.loadingContent")
                : t("commandSearch.noResults")
            }}
          </CommandEmpty>
          <CommandGroup
            v-for="group in groups"
            :key="group.label"
            :heading="group.label"
            class="py-1.5!"
          >
            <CommandItem
              v-for="option in group.options"
              :key="`${option.itemType}:${option.value}`"
              :value="`${option.itemType}:${option.value}`"
              :force-visible="option.itemType === 'cms-entry'"
              class="flex items-center gap-2 cursor-pointer"
              @select="selectOption(option)"
            >
              <div
                :class="[
                  option.icon,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="flex-1 truncate text-xs">{{ option.label }}</span>
              <span
                v-if="option.meta"
                class="text-3xs text-muted-foreground/60 shrink-0 capitalize"
                >{{ option.meta }}</span
              >
              <span
                v-if="option.value === currentValue"
                :class="[studioIcons.checkLinear, 'size-3.5 shrink-0 text-primary']"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
