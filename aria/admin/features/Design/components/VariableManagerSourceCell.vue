<script lang="ts">
export default {
  name: "VariableManagerSourceCell",
};
</script>

<script setup lang="ts">
import type { PropType } from "vue";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStudioI18n } from "@/i18n";
import type { GlobalStyleVariableAlias } from "../../../../lib/styles/universalDesignSystem";
import type { VariableManagerRow } from "../lib/variableManagerTable";
import type { VariableManagerTokenOption } from "../lib/variableManagerTokens";
import DesignTokenPicker from "./DesignTokenPicker.vue";

const { t } = useStudioI18n();

function getCustomSourceLabel(): string {
  return props.row.alias.sourceKey
    ? props.row.sourceLabel
    : t("design.variables.source.chooseVariable");
}

const props = defineProps({
  row: {
    type: Object as PropType<VariableManagerRow>,
    required: true,
  },
  customVariableOptions: {
    type: Array as PropType<readonly { value: string; label: string }[]>,
    required: true,
  },
  designTokenOptions: {
    type: Array as PropType<readonly VariableManagerTokenOption[]>,
    required: true,
  },
  tokenOptionsLoading: {
    type: Boolean,
    default: false,
  },
  onUpdateAliasSourceType: {
    type: Function as PropType<
      (alias: GlobalStyleVariableAlias, value: string) => void
    >,
    required: true,
  },
  onUpdateAliasTokenSource: {
    type: Function as PropType<
      (alias: GlobalStyleVariableAlias, optionValue: string | null) => void
    >,
    required: true,
  },
});
</script>

<template>
  <div v-if="row.kind === 'custom'">
    <div
      class="flex min-h-8 items-center rounded-md border border-transparent bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:border-border/50 hover:bg-card/30"
    >
      {{ t("design.variables.source.directCssValue") }}
    </div>
  </div>

  <div v-else class="grid grid-cols-2 gap-2">
    <Select
      :model-value="row.alias.sourceType"
      @update:model-value="onUpdateAliasSourceType(row.alias, String($event))"
    >
      <SelectTrigger
        class="h-8 rounded-md border-transparent bg-transparent px-2.5 text-sm text-muted-foreground shadow-none transition-colors hover:border-border/50 hover:bg-card/30 hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:border-border focus-visible:bg-background"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="custom">{{ t("design.variables.source.variable") }}</SelectItem>
        <SelectItem value="token">{{ t("design.variables.source.token") }}</SelectItem>
      </SelectContent>
    </Select>

    <Select
      v-if="row.alias.sourceType === 'custom'"
      :model-value="row.alias.sourceKey"
      @update:model-value="row.alias.sourceKey = String($event)"
    >
      <SelectTrigger
        class="h-8 rounded-md border-transparent bg-transparent px-2.5 text-left text-sm text-foreground shadow-none transition-colors hover:border-border/50 hover:bg-card/30 focus:ring-0 focus:ring-offset-0 focus-visible:border-border focus-visible:bg-background"
      >
        <SelectValue>
          {{ getCustomSourceLabel() }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="option in customVariableOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </Select>

    <div
      v-else-if="tokenOptionsLoading"
      class="flex h-8 items-center rounded-md border border-transparent bg-transparent px-2.5 text-sm text-muted-foreground"
    >
      {{ t("design.variables.source.loadingTokens") }}
    </div>

    <DesignTokenPicker
      v-else
      :model-value="row.alias.sourceKey"
      :options="designTokenOptions"
      :placeholder="t('design.variables.source.chooseToken')"
      trigger-class="h-8 rounded-md border-transparent bg-transparent px-2.5 text-sm text-foreground shadow-none hover:border-border/50 hover:bg-card/30"
      content-class="rounded-xl border-border/50 bg-background/96 shadow-xl backdrop-blur"
      @update:model-value="onUpdateAliasTokenSource(row.alias, $event)"
    />
  </div>
</template>
