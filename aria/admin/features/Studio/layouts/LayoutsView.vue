<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBuilderData } from "@/composables/useBuilderData";
import { isStarterLayoutId } from "@/lib/storage/starterLayoutIds";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import {
  DeleteConfirmDialog,
  EmptyState,
  PageHeader,
  SearchOrBulkToolbar,
  SkeletonTable,
  StudioPanelShell,
} from "@/features/Studio/core/components";
import { useDialogState, useStudioRouter } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import CreateLayoutDialog from "./components/CreateLayoutDialog.vue";

defineOptions({ name: "LayoutsView" });

const { layouts, pages, isLoading, isReady } = useBuilderData();
const studioActions = useStudioActions();
const router = useStudioRouter();

const searchQuery = ref("");
const createDialog = useDialogState();
const deleteDialog = useDialogState();
const layoutToDelete = ref<{ id: string; name: string } | null>(null);
const isCreating = ref(false);

function getLayoutPageCount(layoutId: string): number {
  return pages.value.filter((page) => page.layout === layoutId).length;
}

const filteredLayouts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return layouts.value;
  return layouts.value.filter((layout) => {
    const haystack = [layout.id, layout.name, layout.title, layout.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});

async function handleCreate(payload: { name: string }): Promise<void> {
  isCreating.value = true;
  try {
    const slug = await studioActions.createLayout(payload.name);
    createDialog.close();
    if (slug) {
      router.navigateTo(`/layouts/${slug}`);
    }
  } finally {
    isCreating.value = false;
  }
}

function handleEdit(layoutId: string): void {
  router.navigateTo(`/layouts/${layoutId}`);
}

async function handleDuplicate(layoutId: string): Promise<void> {
  await studioActions.duplicateLayout(layoutId);
}

function handleDeleteClick(layout: { id: string; name: string }): void {
  if (isStarterLayoutId(layout.id)) return;
  layoutToDelete.value = layout;
  deleteDialog.open();
}

async function confirmDelete(): Promise<void> {
  if (!layoutToDelete.value) return;
  const success = await studioActions.deleteLayout(layoutToDelete.value.id);
  if (success) {
    layoutToDelete.value = null;
    deleteDialog.close();
  }
}
</script>

<template>
  <StudioPanelShell>
    <PageHeader
      title="Layouts"
      description="Reusable page structure templates."
      :search-query="searchQuery"
      entity-label-singular="layout"
      @update:search-query="(value) => (searchQuery = value)"
      @create="createDialog.open()"
    >
      <template #search>
        <SearchOrBulkToolbar
          :count="0"
          entity-label="layout"
          :search-query="searchQuery"
          search-placeholder="Search layouts…"
          :show-bulk="false"
          :show-duplicate="false"
          :show-delete="false"
          @update:search-query="(value) => (searchQuery = value)"
        />
      </template>
    </PageHeader>

    <div class="flex min-h-0 flex-1 flex-col px-7 pb-7 pt-4">
      <SkeletonTable v-if="isLoading && !isReady" :rows="6" :columns="4" />

      <EmptyState
        v-else-if="filteredLayouts.length === 0"
        entity-label="layouts"
        entity-label-singular="layout"
        :description="
          searchQuery.trim()
            ? 'No layouts match your search.'
            : undefined
        "
        @create="createDialog.open()"
      />

      <div v-else class="overflow-hidden rounded-lg border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>In use</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="layout in filteredLayouts"
              :key="layout.id"
              class="cursor-pointer hover:bg-muted/40"
              @click="handleEdit(layout.id)"
            >
              <TableCell>
                <div class="flex items-center gap-2">
                  <span class="font-medium">
                    {{ layout.name || layout.title || layout.id }}
                  </span>
                  <Badge
                    v-if="isStarterLayoutId(layout.id)"
                    variant="outline"
                    class="text-2xs"
                  >
                    Built-in
                  </Badge>
                </div>
                <div class="text-2xs text-muted-foreground font-mono mt-0.5">
                  {{ layout.id }}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  :variant="getLayoutPageCount(layout.id) > 0 ? 'default' : 'outline'"
                  class="text-2xs"
                >
                  {{
                    getLayoutPageCount(layout.id) > 0
                      ? `${getLayoutPageCount(layout.id)} pages`
                      : "Unused"
                  }}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{
                  layout.updatedAt
                    ? formatRelativeTime(layout.updatedAt)
                    : "—"
                }}
              </TableCell>
              <TableCell class="text-right" @click.stop>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="size-8">
                      <span :class="[studioIcons.moreHorizontal, 'size-4']" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="handleEdit(layout.id)">
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="handleDuplicate(layout.id)">
                      Duplicate
                    </DropdownMenuItem>
                    <template v-if="!isStarterLayoutId(layout.id)">
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        @click="
                          handleDeleteClick({
                            id: layout.id,
                            name: layout.name || layout.id,
                          })
                        "
                      >
                        Delete
                      </DropdownMenuItem>
                    </template>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  </StudioPanelShell>

  <CreateLayoutDialog
      :open="createDialog.isOpen.value"
      :pending="isCreating"
      @update:open="(open) => (open ? createDialog.open() : createDialog.close())"
      @create="handleCreate"
    />

    <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      title="Delete layout?"
      :description="
        layoutToDelete
          ? `Delete “${layoutToDelete.name}”? Pages using this layout will need a new layout assigned.`
          : 'Delete this layout?'
      "
      @update:open="(open) => (open ? deleteDialog.open() : deleteDialog.close())"
      @confirm="confirmDelete"
    />
</template>
