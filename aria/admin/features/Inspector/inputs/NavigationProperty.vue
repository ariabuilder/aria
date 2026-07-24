<script setup lang="ts">
import { computed, ref } from "vue";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseProperty from "./BaseProperty.vue";
import { usePropertySave } from "../../Core";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useNavigationProperty } from "../composables/useNavigationProperty";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: true,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const SOURCE_MODE_TOGGLE_GROUP_CLASS = "grid grid-cols-3 gap-1.5";
const SOURCE_MODE_TOGGLE_CLASS =
  "flex h-8 items-center justify-center rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-border hover:bg-sidebar-80 hover:text-foreground";
const ACTIVE_SOURCE_MODE_TOGGLE_CLASS =
  "border-primary/70 bg-accent-10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";
const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const SELECT_TRIGGER_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs hover:border-border hover:bg-sidebar-80 focus:ring-0 focus:ring-offset-0";
const SELECT_CONTENT_CLASS =
  "border-border-70 bg-sidebar text-foreground shadow-xl";
const GROUP_LABEL_CLASS =
  "text-[10px] uppercase tracking-wide text-muted-foreground";

const { selectedNodeId } = usePropertySave();
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
  isLoading: computed(() => false),
});

const navigation = useNavigationProperty({
  hasSaveContext,
  currentItemType: () => props.currentItemType,
  currentItemSlug: () => props.currentItemSlug,
});

const selectedEntryId = computed(
  () => navigation.propsEditor.selectedCmsEntryId.value,
);
const cmsControlsDisabled = computed(
  () => isPanelDisabled.value || !navigation.hasBoundCmsCollection.value,
);
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    title="Navigation"
    @update:open="sectionOpen = $event"
  >
    <div class="space-y-3">
      <div
        :class="SOURCE_MODE_TOGGLE_GROUP_CLASS"
        role="group"
        :aria-label="t('inspector.navigation.source')"
      >
        <button
          type="button"
          :aria-pressed="navigation.sourceMode.value === 'static'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            navigation.sourceMode.value === 'static' &&
              ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          :disabled="isPanelDisabled"
          @click="void navigation.setSourceMode('static')"
        >
          {{ t("inspector.repeat.static") }}
        </button>
        <button
          type="button"
          :aria-pressed="navigation.sourceMode.value === 'cms'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            navigation.sourceMode.value === 'cms' &&
              ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          :disabled="isPanelDisabled"
          @click="void navigation.setSourceMode('cms')"
        >
          CMS
        </button>
        <button
          type="button"
          :aria-pressed="navigation.sourceMode.value === 'mixed'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            navigation.sourceMode.value === 'mixed' &&
              ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          :disabled="isPanelDisabled"
          @click="void navigation.setSourceMode('mixed')"
        >
          {{ t("inspector.navigation.mixed") }}
        </button>
      </div>

      <template v-if="navigation.hasCmsControls.value">
        <p
          v-if="!navigation.hasBoundCmsCollection.value"
          class="text-xs text-muted-foreground"
        >
          {{ t("inspector.navigation.collectionHint") }}
        </p>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.menu") }}</label>
          <Select
            :model-value="navigation.boundCollectionName.value || undefined"
            :disabled="
              isPanelDisabled || navigation.propsEditor.isLoadingCollections.value
            "
            @update:model-value="
              (value) => void navigation.handleCollectionChange(String(value))
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue :placeholder="t('inspector.navigation.selectCollection')" />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="collection in navigation.cmsCollections.value"
                :key="collection.id"
                :value="collection.name"
              >
                {{ collection.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          :class="SOURCE_MODE_TOGGLE_GROUP_CLASS"
          role="group"
          :aria-label="t('inspector.navigation.loopMode')"
        >
          <button
            type="button"
            :aria-pressed="navigation.loopMode.value === 'collection'"
            :class="[
              SOURCE_MODE_TOGGLE_CLASS,
              navigation.loopMode.value === 'collection' &&
                ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
            ]"
            :disabled="cmsControlsDisabled"
            @click="void navigation.setLoopMode('collection')"
          >
            {{ t("inspector.navigation.entries") }}
          </button>
          <button
            type="button"
            :aria-pressed="navigation.loopMode.value === 'field'"
            :class="[
              SOURCE_MODE_TOGGLE_CLASS,
              navigation.loopMode.value === 'field' &&
                ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
            ]"
            :disabled="cmsControlsDisabled"
            @click="void navigation.setLoopMode('field')"
          >
            {{ t("inspector.navigation.repeater") }}
          </button>
        </div>

        <div
          v-if="navigation.isFieldLoop.value"
          :class="PROPERTY_ROW_CLASS"
        >
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.entry") }}</label>
          <Select
            :model-value="selectedEntryId"
            :disabled="cmsControlsDisabled"
            @update:model-value="
              (value) => void navigation.handleEntryChange(String(value))
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue :placeholder="t('inspector.navigation.entry')" />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="entry in navigation.propsEditor.cmsEntryOptions.value"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          v-if="navigation.isFieldLoop.value"
          :class="PROPERTY_ROW_CLASS"
        >
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.field") }}</label>
          <Select
            :model-value="navigation.navProps.value.fieldPath ?? ''"
            :disabled="cmsControlsDisabled"
            @update:model-value="
              (value) => void navigation.applyFieldLoopSource(String(value))
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue :placeholder="t('inspector.navigation.repeaterField')" />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="field in navigation.repeaterFieldOptions.value"
                :key="field.value"
                :value="field.value"
              >
                {{ field.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <template v-else>
          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.limit") }}</label>
            <Input
              type="number"
              min="1"
              max="100"
              :model-value="
                String(navigation.propsEditor.cmsListLimit.value)
              "
              :disabled="cmsControlsDisabled"
              class="h-9 border-dashed border-border-70 bg-sidebar text-xs"
              @change="
                (event: Event) => {
                  const limit = Number.parseInt(
                    (event.target as HTMLInputElement).value,
                    10,
                  );
                  if (Number.isFinite(limit)) {
                    void navigation.propsEditor.updateCmsListLimit(limit);
                  }
                }
              "
            />
          </div>

          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.sort") }}</label>
            <Select
              :model-value="navigation.propsEditor.cmsListSort.value"
              :disabled="cmsControlsDisabled"
              @update:model-value="
                (value) =>
                  void navigation.propsEditor.updateCmsListSort(String(value))
              "
            >
              <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue :placeholder="t('inspector.navigation.sort')" />
              </SelectTrigger>
              <SelectContent :class="SELECT_CONTENT_CLASS">
                <SelectItem value="-publishedAt">{{ t("inspector.navigation.sort.newest") }}</SelectItem>
                <SelectItem value="publishedAt">{{ t("inspector.navigation.sort.oldest") }}</SelectItem>
                <SelectItem value="-updatedAt">{{ t("inspector.navigation.sort.updated") }}</SelectItem>
                <SelectItem value="title">{{ t("inspector.navigation.sort.title") }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </template>
      </template>

      <div
        class="rounded-md border border-dashed border-border/50 p-2.5 space-y-2 bg-muted/20"
      >
        <p :class="GROUP_LABEL_CLASS">{{ t("inspector.navigation.behavior") }}</p>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.label") }}</label>
          <Input
            :model-value="navigation.navProps.value.ariaLabel"
            :disabled="isPanelDisabled"
            class="h-9 border-dashed border-border-70 bg-sidebar text-xs"
            @change="
              (event: Event) =>
                void navigation.updateNavProps(
                  {
                    ariaLabel: (event.target as HTMLInputElement).value,
                  },
                  'Set navigation label',
                )
            "
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.submenu") }}</label>
          <Select
            :model-value="navigation.navProps.value.submenuTrigger"
            :disabled="isPanelDisabled"
            @update:model-value="
              (value) =>
                void navigation.updateNavProps(
                  {
                    submenuTrigger: value as
                      | 'hover'
                      | 'click'
                      | 'both',
                  },
                  'Set submenu trigger',
                )
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem value="hover">{{ t("inspector.navigation.hover") }}</SelectItem>
              <SelectItem value="click">{{ t("inspector.navigation.click") }}</SelectItem>
              <SelectItem value="both">{{ t("inspector.navigation.both") }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.active") }}</label>
          <Select
            :model-value="navigation.navProps.value.activeMatch"
            :disabled="isPanelDisabled"
            @update:model-value="
              (value) =>
                void navigation.updateNavProps(
                  {
                    activeMatch: value as 'exact' | 'prefix' | 'none',
                  },
                  'Set active match',
                )
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
                <SelectItem value="prefix">{{ t("inspector.navigation.prefix") }}</SelectItem>
                <SelectItem value="exact">{{ t("inspector.navigation.exact") }}</SelectItem>
                <SelectItem value="none">{{ t("inspector.navigation.off") }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.navigation.mobile") }}</label>
            <Switch
              :model-value="navigation.navProps.value.mobileEnabled"
              :disabled="isPanelDisabled"
              @update:model-value="
                (value) =>
                  void navigation.updateNavProps(
                    { mobileEnabled: Boolean(value) },
                    'Toggle mobile menu',
                  )
              "
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.navigation.previewOpen") }}</label>
            <Switch
              :model-value="navigation.navProps.value.builderKeepOpen"
              :disabled="isPanelDisabled"
              @update:model-value="
                (value) =>
                  void navigation.updateNavProps(
                    { builderKeepOpen: Boolean(value) },
                    'Toggle builder submenu preview',
                  )
              "
            />
          </div>
        </div>

        <div
          v-if="navigation.navProps.value.mobileEnabled"
          :class="PROPERTY_ROW_CLASS"
        >
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.breakpoint") }}</label>
          <Select
            :model-value="navigation.navProps.value.mobileBreakpoint"
            :disabled="isPanelDisabled"
            @update:model-value="
              (value) =>
                void navigation.updateNavProps(
                  { mobileBreakpoint: String(value) },
                  'Set mobile breakpoint',
                )
            "
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="breakpoint in navigation.breakpointOptions.value"
                :key="breakpoint.value"
                :value="breakpoint.value"
              >
                {{ breakpoint.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  </BaseProperty>
</template>
