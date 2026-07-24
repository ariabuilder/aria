<script setup lang="ts">
import { computed } from "vue";
import type { Page } from "@/composables/useBuilderData";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { CollectionKind } from "../../../../lib/cms/constants";
import type { CmsRouteWarning } from "../../../../lib/cms/pageUsage";
import type { CmsUrlPatternSource } from "../lib/collectionSettingsForm";
import CollectionTemplateCard, {
  type CollectionTemplatePageOption,
} from "./CollectionTemplateCard.vue";

const props = withDefaults(
  defineProps<{
    listPageId?: string;
    templatePageId?: string;
    urlPattern?: string;
    urlPatternSource?: CmsUrlPatternSource;
    suggestedUrlPattern?: string;
    pageOptions?: readonly CollectionTemplatePageOption[];
    listPageOptions?: readonly CollectionTemplatePageOption[];
    entryPageOptions?: readonly CollectionTemplatePageOption[];
    selectedListPage?: Page | null;
    selectedTemplatePage?: Page | null;
    listPathHint?: string;
    entryPathHint?: string;
    routeWarnings?: readonly CmsRouteWarning[];
    routeWarningLoadError?: string | null;
    urlPatternError?: string;
    collectionKind?: CollectionKind;
    disabled?: boolean;
  }>(),
  {
    listPageId: "",
    templatePageId: "",
    urlPattern: "",
    urlPatternSource: "auto",
    suggestedUrlPattern: "",
    pageOptions: () => [],
    listPageOptions: () => [],
    entryPageOptions: () => [],
    selectedListPage: null,
    selectedTemplatePage: null,
    listPathHint: "",
    entryPathHint: "",
    routeWarnings: () => [],
    routeWarningLoadError: null,
    urlPatternError: "",
    collectionKind: "content",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:listPageId": [value: string];
  "update:templatePageId": [value: string];
  "update:urlPattern": [value: string];
  resetUrlPatternToAuto: [];
  editPageInComposer: [slug: string];
}>();
const { t } = useStudioI18n();

const showUrlPatternControls = computed(
  () => Boolean(props.templatePageId.trim()),
);
const urlPatternBadgeLabel = computed(() =>
  props.urlPatternSource === "manual"
    ? t("collections.publishing.custom")
    : t("collections.publishing.auto"),
);
const hasRouteWarnings = computed(
  () => props.routeWarnings.length > 0 || Boolean(props.routeWarningLoadError),
);

const resolvedListPageOptions = computed(() =>
  props.listPageOptions.length > 0 ? props.listPageOptions : props.pageOptions,
);
const resolvedEntryPageOptions = computed(() =>
  props.entryPageOptions.length > 0 ? props.entryPageOptions : props.pageOptions,
);
const entryTemplateLabel = computed(() =>
  props.collectionKind === "tags"
    ? t("collections.publishing.tagUrlTemplate")
    : t("collections.publishing.entryPage"),
);
const entryTemplateDescription = computed(() =>
  props.collectionKind === "tags"
    ? t("collections.publishing.tagEntryDescription")
    : t("collections.publishing.entryDescription"),
);
const listTemplateDescription = computed(() =>
  props.collectionKind === "tags"
    ? t("collections.publishing.tagListDescription")
    : t("collections.publishing.listDescription"),
);
</script>

<template>
  <section class="grid gap-5">
    <div class="grid gap-1">
      <h2 class="m-0 text-sm font-medium text-muted-foreground">{{ t("collections.publishing.title") }}</h2>
      <p class="m-0 text-xs leading-snug text-muted-foreground">
        {{ t("collections.publishing.description") }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
      <CollectionTemplateCard
        class="min-w-0"
        :label="t('collections.publishing.listTemplate')"
        :description="listTemplateDescription"
        :page-id="listPageId"
        :selected-page="selectedListPage"
        :page-options="resolvedListPageOptions"
        :path-hint="listPathHint"
        :disabled="disabled"
        @update:page-id="emit('update:listPageId', $event)"
        @edit-in-composer="emit('editPageInComposer', $event)"
      />

      <CollectionTemplateCard
        class="min-w-0"
        :label="entryTemplateLabel"
        :description="entryTemplateDescription"
        :page-id="templatePageId"
        :selected-page="selectedTemplatePage"
        :page-options="resolvedEntryPageOptions"
        :path-hint="entryPathHint"
        :disabled="disabled"
        @update:page-id="emit('update:templatePageId', $event)"
        @edit-in-composer="emit('editPageInComposer', $event)"
      />
    </div>

    <div class="grid gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <Label
          for="collection-settings-url-pattern"
          class="text-sm! text-muted-foreground"
        >
          {{ t("collections.publishing.urlPattern") }}
        </Label>
        <Badge
          v-if="showUrlPatternControls"
          variant="outline"
          size="sm"
          class="border-border text-muted-foreground"
        >
          {{ urlPatternBadgeLabel }}
        </Badge>
      </div>

      <Input
        id="collection-settings-url-pattern"
        :model-value="urlPattern"
        :placeholder="suggestedUrlPattern"
        :disabled="disabled || !showUrlPatternControls"
        :aria-invalid="urlPatternError ? 'true' : undefined"
        @update:model-value="emit('update:urlPattern', String($event))"
      />

      <p class="m-0 mt-2 text-xs text-muted-foreground">
        {{ t("collections.publishing.urlPatternDescription") }}
      </p>

      <button
        v-if="showUrlPatternControls && urlPatternSource === 'manual'"
        type="button"
        class="w-fit text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
        :disabled="disabled"
        @click="emit('resetUrlPatternToAuto')"
      >
        {{ t("collections.publishing.resetAuto") }}
      </button>

      <p v-if="urlPatternError" class="text-xs text-destructive">
        {{ urlPatternError }}
      </p>
    </div>

  </section>
</template>
