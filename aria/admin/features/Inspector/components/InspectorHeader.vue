<script setup lang="ts">
/**
 * InspectorHeader - Selection Header Component
 *
 * Displays information about the currently selected element.
 *
 * @component
 */
import { computed } from "vue";
import type { SelectedElementContext } from "../types/inspector";
import PseudoSelectorDropdown from "./PseudoSelectorDropdown.vue";
import DesignWorkbenchTrigger from "../../Design/components/DesignWorkbenchTrigger.vue";
import type { InspectorPseudoState } from "../../../../lib/schemas/classEditor";
import { formatPseudoStateLabel } from "../../../../lib/styles/pseudoSelectors";
import { inspectorNodeTypeIcons } from "@/lib/icons";
import PanelHeader from "../../Core/components/PanelHeader.vue";
import { useStudioI18n } from "@/i18n";

// PROPS & EMITS

interface Props {
  elementContext: SelectedElementContext;
  isLocked?: boolean;
  selectedPseudo?: InspectorPseudoState;
  pseudoEnabled?: boolean;
  hasPseudoRules?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isLocked: false,
  selectedPseudo: "default",
  pseudoEnabled: false,
  hasPseudoRules: false,
});

const emit = defineEmits<{
  "update:selectedPseudo": [value: InspectorPseudoState];
}>();
const { t } = useStudioI18n();

const iconMap = inspectorNodeTypeIcons;

const icon = computed(() => {
  const type = props.elementContext.nodeType.toLowerCase();
  return iconMap[type] ?? iconMap.default;
});

/**
 * Whether a pseudo-selector (not default) is currently selected
 */
const isPseudoActive = computed(() => {
  return props.selectedPseudo !== "default";
});

/**
 * Format the pseudo-selector for display (e.g., ":hover", "::before", ":has(.icon)")
 */
const pseudoDisplay = computed(() => {
  if (!isPseudoActive.value) return "";
  if (props.selectedPseudo === "default") return "";
  return formatPseudoStateLabel(props.selectedPseudo);
});

const displayName = computed(() => {
  if (!props.elementContext.node) {
    return t("inspector.header.noSelection");
  }

  // Use node ID or generate display name from type
  const node = props.elementContext.node;
  if (node.props?.id) {
    return node.props.id;
  }

  return props.elementContext.displayName;
});

function handlePseudoChange(value: InspectorPseudoState) {
  emit("update:selectedPseudo", value);
}
</script>

<template>
  <PanelHeader>
    <div
      class="flex size-5 shrink-0 items-center justify-center bg-transparent"
    >
      <span
        aria-hidden="true"
        :class="[
          icon,
          'size-4.5 shrink-0',
          isLocked ? 'text-primary' : 'text-muted-foreground',
        ]"
      />
    </div>

    <div class="flex items-center min-w-0 flex-1">
      <span
        class="text-xs font-medium capitalize tracking-wide text-muted-foreground truncate select-none"
      >
        {{ displayName }}
      </span>
      <span
        v-if="pseudoEnabled && isPseudoActive"
        class="text-primary font-mono text-2xs ml-1.5 mt-0.5 shrink-0"
      >
        {{ pseudoDisplay }}
      </span>
    </div>

    <template #trailing>
      <div class="flex shrink-0 items-center gap-1">
        <PseudoSelectorDropdown
          v-if="!isLocked && elementContext.node"
          :model-value="selectedPseudo"
          :disabled="!pseudoEnabled"
          :has-pseudo-rules="hasPseudoRules"
          :disabled-message="t('inspector.header.pseudoDisabled')"
          @update:model-value="handlePseudoChange"
        />
        <DesignWorkbenchTrigger />
      </div>
    </template>
  </PanelHeader>
</template>
