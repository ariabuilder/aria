<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Textarea } from "@/components/ui/textarea";
import BaseProperty from "./BaseProperty.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import { usePropertySave } from "../../Core";
import { useCanvasSignalBridge } from "../../Core";
import { JsonObjectSchema } from "../../../../lib/schemas/json";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import {
  buildContentUpdates,
  buildContentValidationCandidate,
  getContentValue,
  isContentMultilineType,
  normalizeContentNodeType,
} from "../composables/useContentContract";
import {
  resolveTextBindingPropName,
  resolveTextBindingSourceMode,
  useInspectorPropBinding,
} from "../composables/useInspectorPropBinding";
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

const { selectedNode, selectedNodeId, isLoading, error, saveProperties } =
  usePropertySave();
const { broadcastPropsUpdate } = useCanvasSignalBridge();
const { safeParse } = usePropertySchema();

const textValue = ref("");
const validationError = ref<string | null>(null);
const textBindingPropName = computed(() =>
  resolveTextBindingPropName(selectedNode.value),
);

const textBinding = useInspectorPropBinding({
  propName: textBindingPropName,
  propType: "string",
  value: textValue,
});

const textSourceMode = ref<"static" | "collection">("static");
const { t } = useStudioI18n();

const SOURCE_MODE_TOGGLE_GROUP_CLASS = "grid grid-cols-2 gap-1.5";
const SOURCE_MODE_TOGGLE_CLASS =
  "flex h-8 items-center justify-center rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-border hover:bg-sidebar-80 hover:text-foreground";
const ACTIVE_SOURCE_MODE_TOGGLE_CLASS =
  "border-primary/70 bg-accent-10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: isLoading,
});

const hasTextChanges = computed(() => textValue.value.length > 0);
const nodeType = computed(() =>
  normalizeContentNodeType(selectedNode.value?.type),
);
const isMultiLine = computed(() => isContentMultilineType(nodeType.value));

const showTextSourceToggle = computed(
  () =>
    textBinding.hasCmsContext.value &&
    !textBinding.propsEditor.isAssignedCmsTemplatePage.value,
);

const isTextReadOnly = computed(
  () =>
    textBinding.isReadOnly.value ||
    textSourceMode.value === "collection" ||
    textBinding.isBound.value,
);

const showTextFieldPicker = computed(
  () =>
    textBinding.showFieldPicker.value &&
    (textBinding.propsEditor.isAssignedCmsTemplatePage.value ||
      textSourceMode.value === "collection" ||
      textBinding.isBound.value),
);

watch(
  selectedNode,
  (node) => {
    textValue.value = getContentValue(node);
    textSourceMode.value = resolveTextBindingSourceMode({
      isBound: textBinding.isBound.value,
      isCollectionPending: textBinding.bindingMode.value === "dynamic",
    });
  },
  { immediate: true, deep: true },
);

watch(
  () => textBinding.isBound.value,
  (isBound) => {
    textSourceMode.value = resolveTextBindingSourceMode({
      isBound,
      isCollectionPending: textBinding.bindingMode.value === "dynamic",
    });
  },
);

function handleTextSourceModeChange(mode: "static" | "collection"): void {
  if (mode === "collection") {
    textSourceMode.value = "collection";
    void textBinding.enterCollectionMode();
    return;
  }

  if (textSourceMode.value === "collection") {
    void textBinding.leaveCollectionMode();
  }
  textSourceMode.value = "static";
}

async function handleTextFieldSelect(fieldPath: string): Promise<void> {
  await textBinding.bind(fieldPath);
  textSourceMode.value = "collection";
}

function validateTextUpdate(updates: Record<string, unknown>): boolean {
  const candidate = buildContentValidationCandidate(
    selectedNode.value,
    updates,
  );

  const parsed = safeParse("text", candidate);
  const valid = "success" in parsed && parsed.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidText");
    return false;
  }

  validationError.value = null;
  return true;
}

async function saveText(value: string): Promise<boolean> {
  if (!selectedNodeId.value) return false;
  if (!props.currentItemType || !props.currentItemSlug) return false;
  if (isTextReadOnly.value) return false;

  const updates = buildContentUpdates(selectedNode.value ?? {}, value);
  if (!validateTextUpdate(updates)) return false;

  const current = getContentValue(selectedNode.value);
  if (current === value) return true;

  const success = await saveProperties(
    updates,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    textValue.value = value;
    return true;
  }

  return false;
}

function emitLiveContentUpdate(value: string): void {
  if (!selectedNodeId.value || isTextReadOnly.value) return;

  const updates = buildContentUpdates(selectedNode.value ?? {}, value);
  const parsedUpdates = JsonObjectSchema.safeParse(updates);

  if (!parsedUpdates.success) {
    return;
  }

  broadcastPropsUpdate({
    nodeId: selectedNodeId.value,
    props: parsedUpdates.data,
    source: "inspector-live",
  });
}

function onTextInput(value: string): void {
  if (isTextReadOnly.value) return;
  textValue.value = value;
  emitLiveContentUpdate(value);
}

async function onTextBlur(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  await saveText(value);
}

async function resetText(): Promise<void> {
  const success = await saveText("");
  if (success) {
    emitLiveContentUpdate("");
  }
}
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="defaultOpen"
    :has-changes="hasTextChanges"
    :show-reset="hasTextChanges && !isTextReadOnly"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.content.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetText()"
    title="Content"
    icon="type"
  >
    <div class="space-y-2">
      <div
        v-if="showTextSourceToggle"
        :class="SOURCE_MODE_TOGGLE_GROUP_CLASS"
        role="group"
        :aria-label="t('inspector.content.source')"
      >
        <button
          type="button"
          :aria-pressed="textSourceMode === 'static'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            textSourceMode === 'static' && ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          @click="handleTextSourceModeChange('static')"
        >
          {{ t("inspector.props.static") }}
        </button>
        <button
          type="button"
          :aria-pressed="textSourceMode === 'collection'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            textSourceMode === 'collection' && ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          @click="handleTextSourceModeChange('collection')"
        >
          {{ t("inspector.props.collection") }}
        </button>
      </div>

      <InspectorPropBinding
        v-if="showTextFieldPicker"
        :model-value="textBinding.boundPath.value"
        :groups="textBinding.fieldGroups.value"
        :picker-mode="textBinding.bindingPickerMode.value"
        :display-label="textBinding.displayLabel.value"
        :disabled="textBinding.pickerDisabled.value"
        :placeholder="t('inspector.props.chooseField')"
        @select="(path) => void handleTextFieldSelect(path)"
        @clear="void textBinding.clear()"
      />

      <Textarea
        :model-value="textValue"
        @update:model-value="(value) => onTextInput(String(value))"
        @blur="onTextBlur"
        :auto-grow="true"
        :rows="isMultiLine ? 4 : 2"
        class="min-h-12 resize-none text-xs px-3 py-2!"
        :disabled="isPanelDisabled || isTextReadOnly"
        :placeholder="t('inspector.content.enter')"
      />

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-red-500">
        {{ error }}
      </div>
    </div>
  </BaseProperty>
</template>
