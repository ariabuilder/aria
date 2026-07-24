<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuilderData } from "../../../composables/useBuilderData";
import { usePropertySave } from "../../Core";
import BaseProperty from "./BaseProperty.vue";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
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

const { components } = useBuilderData();
const { selectedNode, selectedNodeId, isLoading, error, saveProperties } =
  usePropertySave();

const ReferenceSchema = z.object({
  type: z.literal("instance"),
  masterId: z.string().min(1),
});

const ComponentAssignmentSchema = z.object({
  componentRef: z.string().optional(),
  reference: ReferenceSchema.optional(),
});

const selectedComponentId = ref<string>("");
const validationError = ref<string | null>(null);

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});
const hasComponentChanges = computed(
  () => selectedComponentId.value.length > 0,
);

watch(
  selectedNode,
  (node) => {
    selectedComponentId.value = String(
      node?.reference?.masterId || node?.componentRef || "",
    );
  },
  { deep: true, immediate: true },
);

const options = computed(() =>
  components.value
    .map((component) => ({
      id: component.id,
      name: component.name || component.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
);

const validOptionIds = computed(
  () => new Set(options.value.map((opt) => opt.id)),
);

const handleAssign = async (value: unknown): Promise<void> => {
  if (typeof value !== "string") return;
  if (!selectedNodeId.value) return;
  if (!props.currentItemType || !props.currentItemSlug) return;

  const nextId = value === "__none__" ? "" : value;
  if (nextId && !validOptionIds.value.has(nextId)) {
    validationError.value = t("inspector.validation.invalidComponentSelection");
    return;
  }

  const updates = {
    reference: nextId ? { type: "instance", masterId: nextId } : undefined,
    componentRef: nextId || undefined,
  };

  const parsed = ComponentAssignmentSchema.safeParse(updates);
  if (!parsed.success) {
    validationError.value = t("inspector.validation.invalidComponentAssignment");
    return;
  }

  validationError.value = null;

  const success = await saveProperties(
    parsed.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    selectedComponentId.value = nextId;
  }
};

async function resetAssignment(): Promise<void> {
  await handleAssign("__none__");
}
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="defaultOpen"
    :has-changes="hasComponentChanges"
    :show-reset="hasComponentChanges"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.component.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetAssignment()"
    title="Component"
  >
    <div class="space-y-2">
      <label class="text-sm font-medium text-sidebar-foreground/70">
        {{ t("inspector.component.assigned") }}
      </label>
      <Select
        :model-value="selectedComponentId || '__none__'"
        @update:model-value="
          (value) => {
            void handleAssign(value);
          }
        "
      >
        <SelectTrigger :disabled="isPanelDisabled">
          <SelectValue :placeholder="t('inspector.component.select')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{{ t("inspector.component.unassigned") }}</SelectItem>
          <SelectItem
            v-for="component in options"
            :key="component.id"
            :value="component.id"
          >
            {{ component.name }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-red-500">
        {{ error }}
      </div>
    </div>
  </BaseProperty>
</template>
