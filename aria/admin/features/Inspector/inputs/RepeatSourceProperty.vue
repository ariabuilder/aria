<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseProperty from "./BaseProperty.vue";
import LoopArchiveFilterFields from "../components/LoopArchiveFilterFields.vue";
import LoopQueryFields from "../components/LoopQueryFields.vue";
import { usePropertySave } from "../../Core";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropBinding } from "../composables/useInspectorPropBinding";
import {
  INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
  INSPECTOR_CHIP_TOGGLE_CLASS,
  INSPECTOR_CHIP_TOGGLE_GROUP_CLASS,
  INSPECTOR_PROPERTY_LABEL_CLASS,
  INSPECTOR_PROPERTY_ROW_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
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

const { selectedNodeId, isLoading } = usePropertySave();
const loopBinding = useInspectorPropBinding({
  propName: "items",
  propType: "array",
  value: [],
});

const repeatMode = ref<"static" | "repeat">("static");
const internalOpen = ref(props.defaultOpen);

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});

watch(
  () => loopBinding.isCollectionMode.value,
  (isRepeat) => {
    repeatMode.value = isRepeat ? "repeat" : "static";
  },
  { immediate: true },
);

function handleRepeatModeChange(mode: "static" | "repeat"): void {
  if (mode === "repeat") {
    repeatMode.value = "repeat";
    void loopBinding.enterCollectionMode();
    return;
  }

  repeatMode.value = "static";
  void loopBinding.leaveCollectionMode();
}

async function handleCollectionChange(value: string): Promise<void> {
  await loopBinding.propsEditor.updateCmsCollection(value);
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    @update:open="sectionOpen = $event"
    :title="t('inspector.repeat.title')"
    icon="databaseLine"
  >
    <div class="space-y-3">
      <div
        :class="INSPECTOR_CHIP_TOGGLE_GROUP_CLASS"
        role="group"
        :aria-label="t('inspector.repeat.mode')"
      >
        <button
          type="button"
          :aria-pressed="repeatMode === 'static'"
          :class="[
            INSPECTOR_CHIP_TOGGLE_CLASS,
            repeatMode === 'static' && INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
          ]"
          @click="handleRepeatModeChange('static')"
        >
          {{ t("inspector.repeat.static") }}
        </button>
        <button
          type="button"
          :aria-pressed="repeatMode === 'repeat'"
          :class="[
            INSPECTOR_CHIP_TOGGLE_CLASS,
            repeatMode === 'repeat' && INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
          ]"
          @click="handleRepeatModeChange('repeat')"
        >
          {{ t("inspector.repeat.repeat") }}
        </button>
      </div>

      <p
        v-if="loopBinding.usesInheritedLoopSource.value"
        class="m-0 text-3xs text-muted-foreground"
      >
        {{ t("inspector.repeat.loopItem") }}
      </p>

      <template v-else-if="repeatMode === 'repeat'">
        <div
          v-if="loopBinding.hasCmsContext.value"
          :class="INSPECTOR_PROPERTY_ROW_CLASS"
        >
          <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.repeat.collection") }}</label>
          <Select
            :model-value="loopBinding.propsEditor.selectedCollectionName.value"
            :disabled="
              isPanelDisabled ||
              loopBinding.propsEditor.isLoadingCollections.value
            "
            @update:model-value="
              (value) => void handleCollectionChange(String(value))
            "
          >
            <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
              <SelectValue :placeholder="t('inspector.repeat.collection')" />
            </SelectTrigger>
            <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="collection in loopBinding.propsEditor.collections.value"
                :key="collection.id"
                :value="collection.name"
              >
                {{ collection.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <LoopQueryFields :disabled="isPanelDisabled" />
        <LoopArchiveFilterFields :disabled="isPanelDisabled" />
      </template>
    </div>
  </BaseProperty>
</template>
