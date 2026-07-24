<script setup lang="ts">
import type { Page } from "@/composables/useBuilderData";
import { ContextMenuContent } from "@/components/ui/context-menu";
import PageActionsMenuBody from "./PageActionsMenuBody.vue";

defineProps<{
  page: Page;
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
</script>

<template>
  <ContextMenuContent>
    <PageActionsMenuBody
      menu-type="context"
      :page="page"
      :is-publish-pending="isPublishPending"
      @open="emit('open')"
      @edit-in-composer="emit('editInComposer')"
      @rename="emit('rename')"
      @duplicate="emit('duplicate')"
      @publish="emit('publish')"
      @unpublish="emit('unpublish')"
      @archive="emit('archive')"
      @unarchive="emit('unarchive')"
      @regenerate-thumbnail="emit('regenerateThumbnail')"
      @delete="emit('delete')"
    />
  </ContextMenuContent>
</template>
