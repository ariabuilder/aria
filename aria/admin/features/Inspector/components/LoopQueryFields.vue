<script setup lang="ts">
import { computed } from "vue";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropsEditor } from "../composables/usePropsEditor";
import {
  INSPECTOR_INPUT_CLASS,
  INSPECTOR_PROPERTY_LABEL_CLASS,
  INSPECTOR_PROPERTY_ROW_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
import { useStudioI18n } from "@/i18n";

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const propsEditor = usePropsEditor();
const { t } = useStudioI18n();

const isDisabled = computed(
  () => props.disabled || !propsEditor.selectedCollection.value,
);

function localeDisplayName(locale: string): string {
  const normalizedLocale = locale.trim();
  if (!normalizedLocale) return locale;

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(normalizedLocale) ?? normalizedLocale;
  } catch {
    return normalizedLocale;
  }
}

async function handleLimitChange(value: string): Promise<void> {
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit)) return;
  await propsEditor.updateCmsListLimit(limit);
}

async function handleSortChange(value: string): Promise<void> {
  await propsEditor.updateCmsListSort(value);
}

async function handleStatusChange(value: string): Promise<void> {
  await propsEditor.updateCmsListStatus(value);
}

async function handleOffsetChange(value: string): Promise<void> {
  const offset = Number.parseInt(value, 10);
  if (!Number.isFinite(offset)) return;
  await propsEditor.updateCmsListOffset(offset);
}

async function handleLocaleChange(value: string): Promise<void> {
  await propsEditor.updateCmsListLocale(value);
}
</script>

<template>
  <div class="space-y-2" data-testid="loop-query-fields">
    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.query.entries") }}</label>
      <Input
        type="number"
        inputmode="numeric"
        min="1"
        max="100"
        step="1"
        :model-value="String(propsEditor.cmsListLimit.value)"
        :disabled="isDisabled"
        :class="INSPECTOR_INPUT_CLASS"
        @change="
          (event: Event) =>
            void handleLimitChange((event.target as HTMLInputElement).value)
        "
      />
    </div>

    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.query.sort") }}</label>
      <Select
        :model-value="propsEditor.cmsListSort.value"
        :disabled="isDisabled"
        @update:model-value="(value) => void handleSortChange(String(value))"
      >
        <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
          <SelectValue :placeholder="t('inspector.query.sort')" />
        </SelectTrigger>
        <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
          <SelectItem value="-publishedAt">{{ t("inspector.query.newest") }}</SelectItem>
          <SelectItem value="publishedAt">{{ t("inspector.query.oldestPublished") }}</SelectItem>
          <SelectItem value="-updatedAt">{{ t("inspector.query.recentlyUpdated") }}</SelectItem>
          <SelectItem value="updatedAt">{{ t("inspector.query.leastRecentlyUpdated") }}</SelectItem>
          <SelectItem value="-createdAt">{{ t("inspector.query.newestCreated") }}</SelectItem>
          <SelectItem value="createdAt">{{ t("inspector.query.oldestCreated") }}</SelectItem>
          <SelectItem value="title">{{ t("inspector.query.titleAsc") }}</SelectItem>
          <SelectItem value="-title">{{ t("inspector.query.titleDesc") }}</SelectItem>
          <SelectItem value="slug">{{ t("inspector.query.slugAsc") }}</SelectItem>
          <SelectItem value="-slug">{{ t("inspector.query.slugDesc") }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.query.status") }}</label>
      <Select
        :model-value="propsEditor.cmsListStatus.value || '__auto__'"
        :disabled="isDisabled"
        @update:model-value="(value) => void handleStatusChange(String(value))"
      >
        <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
          <SelectValue :placeholder="t('inspector.query.status')" />
        </SelectTrigger>
        <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
          <SelectItem value="__auto__">Published</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.query.offset") }}</label>
      <Input
        type="number"
        inputmode="numeric"
        min="0"
        max="10000"
        step="1"
        :model-value="String(propsEditor.cmsListOffset.value)"
        :disabled="isDisabled"
        :class="INSPECTOR_INPUT_CLASS"
        @change="
          (event: Event) =>
            void handleOffsetChange((event.target as HTMLInputElement).value)
        "
      />
    </div>

    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.query.locale") }}</label>
      <Select
        :model-value="propsEditor.cmsListLocale.value || '__default__'"
        :disabled="
          isDisabled || propsEditor.cmsLocaleOptions.value.length === 0
        "
        @update:model-value="(value) => void handleLocaleChange(String(value))"
      >
        <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
          <SelectValue :placeholder="t('inspector.query.locale')" />
        </SelectTrigger>
        <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
          <SelectItem value="__default__">{{ t("inspector.query.pageLocale") }}</SelectItem>
          <SelectItem
            v-for="locale in propsEditor.cmsLocaleOptions.value"
            :key="locale"
            :value="locale"
          >
            {{ localeDisplayName(locale) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
