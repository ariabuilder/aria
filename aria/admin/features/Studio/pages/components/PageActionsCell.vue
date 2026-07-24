<script setup lang="ts">
import type { Page } from "@/composables/useBuilderData";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import PageActionsMenuBody from "./PageActionsMenuBody.vue";
import { useStudioI18n } from "@/i18n";

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
const { t } = useStudioI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="sidebar-action" size="icon-sm" class="shrink-0 w-8!">
        <span :class="[studioIcons.moreHorizontal, 'size-4! p-0! shrink-0']" />
        <span class="sr-only">{{ t("pages.actions") }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-48"
      @click.stop
    >
      <PageActionsMenuBody
        menu-type="dropdown"
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
    </DropdownMenuContent>
  </DropdownMenu>
</template>
