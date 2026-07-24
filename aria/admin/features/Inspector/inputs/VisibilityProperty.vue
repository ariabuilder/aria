<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";
import BaseProperty from "./BaseProperty.vue";
import { usePropertySave } from "../../Core";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { usePropertySchema } from "../composables/usePropertySchema";
import type { VisibilityValue } from "../schemas/visibility.schema";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const { safeParse, getDefault } = usePropertySchema();

const isVisible = ref(true);
const validationError = ref<string | null>(null);

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const defaultVisibility = computed<VisibilityValue>(() => {
  const fallback: VisibilityValue = {
    display: { base: "block" },
    visibility: { base: "visible" },
    opacity: { base: "1" },
  };

  return (getDefault("visibility") as VisibilityValue) ?? fallback;
});

const visibilityHeaderIcon = computed(() =>
  isVisible.value ? studioIcons.eye : studioIcons.eyeOff,
);

const visibilityHeaderIconClass = computed(() =>
  isVisible.value ? "text-muted-foreground" : "text-muted-foreground",
);

function getDisplayValue(): string {
  return (
    styleTarget.getStyleValue("display", "block", breakpointName.value) ??
    "block"
  );
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    isVisible.value = getDisplayValue() !== "none";
  },
  { deep: true, immediate: true },
);

function validateVisibility(nextDisplay: "block" | "none"): boolean {
  const candidate: VisibilityValue = {
    ...defaultVisibility.value,
    display: {
      ...defaultVisibility.value.display,
      [breakpointName.value]: nextDisplay,
    },
    visibility: {
      ...defaultVisibility.value.visibility,
      [breakpointName.value]: nextDisplay === "none" ? "hidden" : "visible",
    },
    opacity: {
      ...defaultVisibility.value.opacity,
      [breakpointName.value]: nextDisplay === "none" ? "0" : "1",
    },
  };

  const result = safeParse("visibility", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidVisibility");
    return false;
  }

  validationError.value = null;
  return true;
}

async function toggleVisibility(): Promise<void> {
  if (!hasSaveContext()) return;

  const nextVisible = !isVisible.value;
  const nextDisplay = nextVisible ? "block" : "none";

  if (!validateVisibility(nextDisplay)) return;

  const success = await styleTarget.saveStyleProperty(
    "display",
    nextDisplay,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    isVisible.value = nextVisible;
  }
}

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}
</script>

<template>
  <div>
    <BaseProperty
      title="Visibility"
      :collapsible="false"
      :interactive="true"
      :disabled="isPanelDisabled"
      :status-icon="visibilityHeaderIcon"
      :status-icon-class="visibilityHeaderIconClass"
      @header-click="toggleVisibility"
    />

    <div v-if="validationError || targetError" class="px-2 py-2 space-y-1">
      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="targetError" class="text-xs text-red-500">
        {{ targetError }}
      </div>
    </div>
  </div>
</template>
