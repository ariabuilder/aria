<script setup lang="ts">
import { computed, type Component } from "vue";
import type { Page } from "@/composables/useBuilderData";
import { useCapabilities } from "@/composables/useCapabilities";
import { studioIcons } from "@/lib/icons";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import PageMenuSectionLabel from "./PageMenuSectionLabel.vue";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  page: Page;
  menuType: "context" | "dropdown";
  isPublishPending?: boolean;
}>();

const emit = defineEmits<{
  open: [];
  editInComposer: [];
  rename: [];
  duplicate: [];
  publish: [];
  unpublish: [];
  archive: [];
  unarchive: [];
  regenerateThumbnail: [];
  delete: [];
}>();

const MenuItem = computed<Component>(() =>
  props.menuType === "context" ? ContextMenuItem : DropdownMenuItem,
);

const isHomePage = computed(() => props.page.slug === "index");

const { canOperation } = useCapabilities();
const canEditInComposer = computed(() => canOperation("save.page"));
const canDuplicate = computed(() => canOperation("crud.duplicateItem"));
const canPublish = computed(() => canOperation("publishing.publish"));
const canUnpublish = computed(() => canOperation("publishing.unpublish"));
const canArchive = computed(() => canOperation("publishing.archive"));
const canUnarchive = computed(() => canOperation("publishing.unarchive"));
const canDeletePage = computed(() => canOperation("crud.deleteItem"));
const { t } = useStudioI18n();
</script>

<template>
  <div class="page-actions-menu">
    <PageMenuSectionLabel first>{{ t("pages.menu.navigate") }}</PageMenuSectionLabel>
    <component :is="MenuItem" @click="emit('open')">
      <span :class="[studioIcons.settings, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.open") }}
    </component>
    <component
      v-if="canEditInComposer"
      :is="MenuItem"
      @click="emit('editInComposer')"
    >
      <span :class="[studioIcons.edit, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.editInComposer") }}
    </component>

    <PageMenuSectionLabel compact>{{ t("pages.menu.page") }}</PageMenuSectionLabel>
    <component :is="MenuItem" @click="emit('rename')">
      <span :class="[studioIcons.rename, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.rename") }}
    </component>
    <component
      v-if="canDuplicate"
      :is="MenuItem"
      @click="emit('duplicate')"
    >
      <span :class="[studioIcons.duplicate, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.duplicate") }}
    </component>

    <PageMenuSectionLabel compact>{{ t("pages.menu.status") }}</PageMenuSectionLabel>
    <component
      :is="MenuItem"
      v-if="isPublishPending"
      disabled
      class="text-muted-foreground"
    >
      <span
        :class="[studioIcons.loading, 'mr-2 size-3.5 shrink-0 animate-spin']"
      />
      {{ t("pages.action.publishing") }}
    </component>
    <component
      :is="MenuItem"
      v-else-if="page.status !== 'published' && canPublish"
      @click="emit('publish')"
    >
      <span :class="[studioIcons.check, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.publish") }}
    </component>
    <component
      :is="MenuItem"
      v-else-if="canUnpublish"
      @click="emit('unpublish')"
    >
      <span :class="[studioIcons.eyeOff, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.unpublish") }}
    </component>
    <component
      :is="MenuItem"
      v-if="page.status !== 'archived' && !isHomePage && canArchive"
      @click="emit('archive')"
    >
      <span :class="[studioIcons.archived, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.archive") }}
    </component>
    <component
      :is="MenuItem"
      v-if="page.status === 'archived' && canUnarchive"
      @click="emit('unarchive')"
    >
      <span :class="[studioIcons.refresh, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.unarchive") }}
    </component>
    <component :is="MenuItem" @click="emit('regenerateThumbnail')">
      <span :class="[studioIcons.refresh, 'mr-2 size-3.5 shrink-0']" />
      {{ t("pages.action.regenerateThumbnail") }}
    </component>

    <template v-if="!isHomePage && canDeletePage">
      <PageMenuSectionLabel compact>{{ t("pages.menu.remove") }}</PageMenuSectionLabel>
      <component :is="MenuItem" variant="destructive" @click="emit('delete')">
        <span :class="[studioIcons.trash, 'mr-2 size-3.5 shrink-0']" />
        {{ t("pages.action.delete") }}
      </component>
    </template>
  </div>
</template>
