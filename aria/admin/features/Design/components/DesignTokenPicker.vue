<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, ref } from "vue";
import { cn } from "@/lib/utils";
import { useStudioI18n } from "@/i18n";

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
import type { VariableManagerTokenOption } from "../lib/variableManagerTokens";

const { t } = useStudioI18n();

interface DesignTokenPickerProps {
  modelValue: string | null;
  options: readonly VariableManagerTokenOption[];
  placeholder?: string;
  triggerClass?: HTMLAttributes["class"];
  contentClass?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<DesignTokenPickerProps>(), {
  placeholder: "Select token",
  triggerClass: undefined,
  contentClass: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const isOpen = ref(false);
const activeGroup = ref<string>("all");

const selectedOption = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue) ?? null,
);

const groupedOptions = computed(() => {
  const groups = new Map<string, VariableManagerTokenOption[]>();

  for (const option of props.options) {
    const entries = groups.get(option.group);
    if (entries) {
      entries.push(option);
      continue;
    }

    groups.set(option.group, [option]);
  }

  return Array.from(groups.entries()).map(([heading, options]) => ({
    heading,
    options,
  }));
});

const filterGroups = computed(() => [
  { value: "all", label: t("design.variables.filter.all") },
  ...groupedOptions.value.map((group) => ({
    value: group.heading,
    label: formatGroupLabel(group.heading),
  })),
]);

function formatGroupLabel(heading: string): string {
  if (heading === "Palette Tokens") {
    return t("design.variables.tokenPicker.paletteTokens");
  }

  if (heading === "Semantic Tokens") {
    return t("design.variables.tokenPicker.semanticTokens");
  }

  return heading.replace(/ Tokens$/, "");
}

const visibleGroups = computed(() => {
  if (activeGroup.value === "all") {
    return groupedOptions.value;
  }

  return groupedOptions.value.filter(
    (group) => group.heading === activeGroup.value,
  );
});

function updateValue(value: string | null): void {
  emit("update:modelValue", value);
  isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="
          cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 text-left text-sm text-foreground transition-colors hover:border-foreground/20',
            props.triggerClass,
          )
        "
      >
        <span class="flex min-w-0 items-center gap-2">
          <span
            v-if="selectedOption"
            class="h-3 w-3 shrink-0 rounded-full border border-border/50"
            :style="{ backgroundColor: selectedOption.preview }"
          />
          <span class="truncate text-sm text-foreground">
            {{ selectedOption?.label || props.placeholder }}
          </span>
        </span>

        <span
          class="i-hugeicons:search-01 h-4 w-4 shrink-0 text-muted-foreground"
        />
      </button>
    </PopoverTrigger>

    <PopoverContent
      :class="cn('w-96 p-0', props.contentClass)"
      align="start"
      :side-offset="6"
    >
      <Command>
        <CommandInput :placeholder="t('design.variables.tokenPicker.searchPlaceholder')" />
        <div
          class="flex flex-wrap gap-2 border-b border-dashed border-border px-3 py-2"
        >
          <button
            v-for="group in filterGroups"
            :key="group.value"
            type="button"
            :class="[
              'rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.16em] transition-colors',
              activeGroup === group.value
                ? 'border-foreground/20 bg-foreground text-background'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            ]"
            @click="activeGroup = group.value"
          >
            {{ group.label }}
          </button>
        </div>
        <CommandList>
          <CommandEmpty>{{ t("design.variables.tokenPicker.noMatches") }}</CommandEmpty>

          <CommandGroup
            v-for="group in visibleGroups"
            :key="group.heading"
            :heading="formatGroupLabel(group.heading)"
          >
            <CommandItem
              v-for="option in group.options"
              :key="option.value"
              :value="`${option.label} ${option.meta} ${option.value}`"
              @select="updateValue(option.value)"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="h-3 w-3 shrink-0 rounded-full border border-border/50"
                  :style="{ backgroundColor: option.preview }"
                />
                <div class="flex min-w-0 flex-col items-start">
                  <span class="truncate">{{ option.label }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ option.meta }}
                  </span>
                </div>
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
