<script setup lang="ts">
import { computed, ref } from "vue";

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
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";

export type GlobalStyleVariablePickerOption = {
  value: string;
  label: string;
  meta: string;
  group: string;
};

interface GlobalStyleVariablePickerProps {
  modelValue: string | null;
  options: readonly GlobalStyleVariablePickerOption[];
  placeholder?: string;
  compact?: boolean;
  inline?: boolean;
}

const props = withDefaults(defineProps<GlobalStyleVariablePickerProps>(), {
  placeholder: "Select variable",
  compact: false,
  inline: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const { t } = useStudioI18n();
const isOpen = ref(false);

const selectedOption = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue) ?? null,
);

const buttonTitle = computed(() =>
  selectedOption.value
    ? t("design.globalStyles.variableAssigned", {
        label: selectedOption.value.label,
      })
    : t("design.globalStyles.assignVariable"),
);

const groupedOptions = computed(() => {
  const groups = new Map<string, GlobalStyleVariablePickerOption[]>();

  for (const option of props.options) {
    const group = groups.get(option.group);
    if (group) {
      group.push(option);
      continue;
    }

    groups.set(option.group, [option]);
  }

  return Array.from(groups.entries()).map(([heading, options]) => ({
    heading,
    options,
  }));
});

function updateValue(value: string | null): void {
  emit("update:modelValue", value);
  isOpen.value = false;
}
</script>

<template>
  <div v-if="inline" class="flex items-center">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          :title="buttonTitle"
          :class="[
            'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
            selectedOption ? 'text-primary hover:text-primary' : '',
          ]"
          @click.stop
        >
          <span :class="[studioIcons.variable, 'size-4 shrink-0']" />
        </button>
      </PopoverTrigger>

      <PopoverContent class="w-88 p-0" align="start" :side-offset="6">
        <Command>
          <CommandInput :placeholder="t('design.globalStyles.searchVariables')" />
          <CommandList>
            <CommandEmpty>
              {{ t("design.globalStyles.noMatchingVariables") }}
            </CommandEmpty>

            <CommandGroup :heading="t('design.globalStyles.variableMode')">
              <CommandItem value="direct-value" @select="updateValue(null)">
                <div class="flex flex-col items-start">
                  <span>{{ t("design.globalStyles.useDirectValue") }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ t("design.globalStyles.useDirectValueDescription") }}
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>

            <CommandGroup
              v-for="group in groupedOptions"
              :key="group.heading"
              :heading="group.heading"
            >
              <CommandItem
                v-for="option in group.options"
                :key="option.value"
                :value="`${option.label} ${option.meta} ${option.value}`"
                @select="updateValue(option.value)"
              >
                <div class="flex flex-col items-start">
                  <span>{{ option.label }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ option.meta }}
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>

  <div v-else class="flex items-center gap-2">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          :class="
            props.compact
              ? [
                  'group inline-flex h-9! w-9 shrink-0 items-center justify-center rounded-sm border border-border/50 border-solid bg-sidebar/40 text-muted-foreground transition-[color,box-shadow] hover:bg-sidebar/80 hover:border-border/50 hover:text-foreground',
                  selectedOption ? 'text-primary hover:text-primary' : '',
                ]
              : 'group flex h-9 min-w-0 flex-1 items-center justify-between gap-3 rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 text-left text-muted-foreground transition-[color,box-shadow] hover:bg-sidebar/80 hover:border-border/50 hover:text-primary'
          "
        >
          <span v-if="!props.compact" class="text-sm">
            {{ t("design.globalStyles.variable") }}
          </span>

          <span
            :class="
              props.compact
                ? `${studioIcons.variable} size-4 shrink-0 transition-colors`
                : `${studioIcons.variable} h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary`
            "
          />
        </button>
      </PopoverTrigger>

      <PopoverContent class="w-88 p-0" align="start" :side-offset="6">
        <Command>
          <CommandInput :placeholder="t('design.globalStyles.searchVariables')" />
          <CommandList>
            <CommandEmpty>
              {{ t("design.globalStyles.noMatchingVariables") }}
            </CommandEmpty>

            <CommandGroup :heading="t('design.globalStyles.variableMode')">
              <CommandItem value="direct-value" @select="updateValue(null)">
                <div class="flex flex-col items-start">
                  <span>{{ t("design.globalStyles.useDirectValue") }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ t("design.globalStyles.useDirectValueDescription") }}
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>

            <CommandGroup
              v-for="group in groupedOptions"
              :key="group.heading"
              :heading="group.heading"
            >
              <CommandItem
                v-for="option in group.options"
                :key="option.value"
                :value="`${option.label} ${option.meta} ${option.value}`"
                @select="updateValue(option.value)"
              >
                <div class="flex flex-col items-start">
                  <span>{{ option.label }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ option.meta }}
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    <button
      v-if="selectedOption && !props.compact"
      type="button"
      class="h-9 rounded-md border border-border px-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      @click="updateValue(null)"
    >
      {{ t("design.globalStyles.clear") }}
    </button>
  </div>
</template>
