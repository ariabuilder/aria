<script setup lang="ts">
import { computed } from "vue";
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
import type {
  CmsBindingFieldOption,
  CmsBindingFieldOptionGroup,
} from "@/features/Inspector/composables/usePropsEditor";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    groups: readonly CmsBindingFieldOptionGroup[];
    disabled?: boolean;
    placeholder?: string;
    displayLabel?: string;
    emptyLabel?: string;
    contentClass?: string;
    variant?: "default" | "toolbar";
    active?: boolean;
    showStaticOption?: boolean;
  }>(),
  {
    modelValue: "",
    disabled: false,
    placeholder: "",
    displayLabel: "",
    emptyLabel: "",
    contentClass: "w-[var(--reka-popover-trigger-width)]",
    variant: "default",
    active: false,
    showStaticOption: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [field: CmsBindingFieldOption];
  clear: [];
}>();
const { t } = useStudioI18n();

const open = defineModel<boolean>("open", { default: false });

const allOptions = computed(() =>
  props.groups.flatMap((group) => group.options),
);

const selectedField = computed(
  () => allOptions.value.find((option) => option.path === props.modelValue) ?? null,
);

const triggerLabel = computed(() => {
  if (props.displayLabel) {
    return props.displayLabel;
  }
  return selectedField.value?.label || props.placeholder || t("cms.fieldPicker.choose");
});

const showStaticCommandItem = computed(
  () =>
    props.showStaticOption &&
    Boolean(props.modelValue?.trim() || props.active),
);

function selectField(field: CmsBindingFieldOption): void {
  emit("update:modelValue", field.path);
  emit("select", field);
  open.value = false;
}

function selectStatic(): void {
  emit("clear");
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        v-if="variant === 'default'"
        type="button"
        variant="outline"
        class="h-8! w-full min-w-0 justify-between rounded-sm border-dashed border-border! bg-input! px-3 text-left text-xs font-normal"
        :disabled="disabled || groups.length === 0"
        :aria-label="placeholder"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            v-if="selectedField"
            :class="[studioIcons.inspectorTabProps, 'size-3 shrink-0 text-primary']"
          />
          <span class="min-w-0 truncate">{{ triggerLabel }}</span>
        </span>
        <span :class="[studioIcons.chevronDown, 'size-3.5 shrink-0 opacity-60']" />
      </Button>
      <Button
        v-else
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-6! w-6! shrink-0"
        :disabled="disabled || groups.length === 0"
        :aria-label="triggerLabel"
        :title="triggerLabel"
      >
        <span
          :class="[
            studioIcons.inspectorTabProps,
            'size-4 shrink-0',
            { 'text-primary': active || selectedField },
          ]"
        />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      side="bottom"
      class="p-0"
      :class="contentClass"
      :side-offset="6"
    >
      <Command>
        <CommandInput :placeholder="t('cms.fieldPicker.search')" />
        <CommandList class="max-h-72">
          <CommandEmpty>{{ emptyLabel || t("cms.fieldPicker.empty") }}</CommandEmpty>
          <CommandGroup v-if="showStaticCommandItem">
            <CommandItem
              value="static-use-manual-content"
              class="gap-3"
              @pointerdown.prevent="selectStatic"
              @click.stop="selectStatic"
              @select="selectStatic"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-foreground">{{ t("cms.fieldPicker.static") }}</span>
                <span class="block truncate text-2xs text-muted-foreground">
                  {{ t("cms.fieldPicker.staticDescription") }}
                </span>
              </span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup
            v-for="group in groups"
            :key="group.label"
            :heading="group.label"
          >
            <CommandItem
              v-for="field in group.options"
              :key="field.path"
              :value="`${field.label} ${field.path} ${field.type}`"
              class="gap-3"
              @pointerdown.prevent="selectField(field)"
              @click.stop="selectField(field)"
              @select="selectField(field)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-foreground">
                  {{ field.label }}
                </span>
                <span
                  v-if="field.description"
                  class="block truncate text-2xs text-muted-foreground"
                >
                  {{ field.description }}
                </span>
              </span>
              <span
                v-if="field.path === modelValue"
                :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
