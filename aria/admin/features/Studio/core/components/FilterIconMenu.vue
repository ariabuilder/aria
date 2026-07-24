<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import HeaderActionDropdownTooltip from "./HeaderActionDropdownTooltip.vue";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useStudioI18n } from "@/i18n";

export interface FilterIconMenuOption {
  key: string;
  label: string;
  count: number;
}

export interface FilterIconMenuSection {
  label: string;
  options: FilterIconMenuOption[];
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    filters: FilterIconMenuOption[];
    sections?: FilterIconMenuSection[];
    defaultValue?: string;
    activeLabel?: string;
  }>(),
  {
    defaultValue: "all",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
const { t } = useStudioI18n();

const isFiltered = computed(
  () => props.modelValue !== props.defaultValue,
);

const filterIcon = computed(() =>
  isFiltered.value ? studioIcons.filterRemove : studioIcons.filter,
);

const allOptions = computed(() => [
  ...props.filters,
  ...(props.sections ?? []).flatMap((section) => section.options),
]);

const activeLabel = computed(
  () =>
    props.activeLabel ??
    allOptions.value.find((filter) => filter.key === props.modelValue)?.label ??
    t("common.filter"),
);

function selectFilter(key: string) {
  emit("update:modelValue", key);
}
</script>

<template>
  <HeaderActionDropdownTooltip
    :label="isFiltered ? `${t('common.filter')}: ${activeLabel}` : t('common.filter')"
  >
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="headerAction"
          size="icon-header"
          :class="isFiltered ? 'text-foreground' : 'text-muted-foreground'"
          :aria-label="t('common.filter')"
        >
          <span :class="[filterIcon, 'shrink-0']" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-44 min-w-0 p-0">
        <DropdownMenuItem
          v-for="filter in props.filters"
          :key="filter.key"
          :class="
            cn(
              'cursor-pointer px-2.5 py-1.5 text-sm',
              filter.key === props.modelValue &&
                'bg-input text-primary focus:bg-input focus:text-primary hover:bg-input hover:text-primary',
            )
          "
          @select.prevent="selectFilter(filter.key)"
        >
          <div class="flex w-full items-center justify-between gap-4">
            <span>{{ filter.label }}</span>
            <span
              :class="
                cn(
                  'shrink-0 tabular-nums text-2xs',
                  filter.key === props.modelValue
                    ? 'text-primary'
                    : 'text-muted-foreground/50',
                )
              "
            >
              {{ filter.count }}
            </span>
          </div>
        </DropdownMenuItem>

        <template v-for="section in props.sections ?? []" :key="section.label">
          <DropdownMenuLabel class="px-2.5 pt-3 py-1 text-3xs! font-medium uppercase tracking-wide text-muted-foreground/50!">
            {{ section.label }}
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="filter in section.options"
            :key="filter.key"
            :class="
              cn(
                'cursor-pointer px-2.5 py-1.5 text-sm',
                filter.key === props.modelValue &&
                  'bg-input text-primary focus:bg-input focus:text-primary hover:bg-input hover:text-primary',
              )
            "
            @select.prevent="selectFilter(filter.key)"
          >
            <div class="flex w-full items-center justify-between gap-4">
              <span class="truncate">{{ filter.label }}</span>
              <span
                :class="
                  cn(
                    'shrink-0 tabular-nums text-2xs',
                    filter.key === props.modelValue
                      ? 'text-primary'
                      : 'text-muted-foreground/50',
                  )
                "
              >
                {{ filter.count }}
              </span>
            </div>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </HeaderActionDropdownTooltip>
</template>
