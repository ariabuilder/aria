<script setup lang="ts">
import { computed, ref } from "vue";
import type { Page } from "@/composables/useBuilderData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import PagePreviewFrame from "@/features/Studio/pages/components/PagePreviewFrame.vue";
import { resolvePagePreviewStage } from "@/features/Studio/pages/composables/resolvePagePreviewStage";
import { STATUS_SURFACE, STATUS_TEXT } from "@/lib/statusTokens";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { StoredPageSystemRole } from "../../../../lib/storage/adapter";

export interface CollectionTemplatePageOption {
  id: string;
  label: string;
  slug: string;
  systemRole?: StoredPageSystemRole;
}

const props = withDefaults(
  defineProps<{
    label: string;
    description: string;
    pageId?: string;
    selectedPage?: Page | null;
    pageOptions: readonly CollectionTemplatePageOption[];
    pathHint?: string;
    disabled?: boolean;
  }>(),
  {
    pageId: "",
    selectedPage: null,
    pathHint: "",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:pageId": [value: string];
  editInComposer: [slug: string];
}>();
const { t } = useStudioI18n();

const isPickerOpen = ref(false);

const isConfigured = computed(() => Boolean(props.pageId.trim()));
const statusLabel = computed(() =>
  isConfigured.value
    ? (props.selectedPage?.title || props.selectedPage?.slug || t("collections.template.configured"))
    : t("collections.template.notSet"),
);
const roleBadgeLabel = computed(() => {
  if (props.selectedPage?.systemRole === "cms-collection") return t("collections.template.collection");
  if (props.selectedPage?.systemRole === "cms-entry") return t("collections.template.entry");
  return null;
});

function pageOptionRoleLabel(systemRole?: StoredPageSystemRole): string | null {
  if (systemRole === "cms-collection") return t("collections.template.collection");
  if (systemRole === "cms-entry") return t("collections.template.entry");
  return null;
}

function selectPage(id: string): void {
  emit("update:pageId", id);
  isPickerOpen.value = false;
}

function clearSelection(): void {
  emit("update:pageId", "");
}

function handleEditInComposer(): void {
  const slug = props.selectedPage?.slug?.trim();
  if (!slug) return;
  emit("editInComposer", slug);
}
</script>

<template>
  <article
    class="grid min-w-0 gap-3 rounded-md border border-border bg-card/40 p-3.5"
    :class="disabled ? 'opacity-60' : ''"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 grid gap-2">
        <h3 class="m-0 text-sm font-medium leading-none text-muted-foreground">
          {{ label }}
        </h3>
        <p class="m-0 text-xs text-balance leading-snug text-muted-foreground/60">
          {{ description }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Badge
          v-if="roleBadgeLabel"
          variant="outline"
          size="sm"
          :class="STATUS_SURFACE.violet"
        >
          {{ roleBadgeLabel }}
        </Badge>
        <Badge
          v-else-if="!isConfigured"
          variant="outline"
          size="sm"
          class="border-border text-muted-foreground"
        >
          {{ statusLabel }}
        </Badge>
        <span
          v-else
          class="max-w-[10rem] truncate text-xs text-muted-foreground"
          :title="statusLabel"
        >
          {{ statusLabel }}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-8 shrink-0 text-muted-foreground"
              :disabled="disabled"
              :aria-label="t('collections.template.options')"
            >
              <span :class="[studioIcons.moreHorizontal, 'size-4']" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem
              :disabled="!isConfigured || disabled"
              @click="handleEditInComposer"
            >
              <span :class="[studioIcons.edit, 'size-4']" />
              {{ t("collections.template.editInComposer") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              :disabled="!isConfigured || disabled"
              variant="destructive"
              @click="clearSelection"
            >
              <span :class="[studioIcons.close, 'size-4']" />
              {{ t("collections.template.clearSelection") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div
      class="relative aspect-video overflow-hidden rounded-md border border-border bg-muted/30"
    >
      <PagePreviewFrame
        v-if="isConfigured && selectedPage"
        :key="`${selectedPage.slug}:${selectedPage.snapshotUrl ?? ''}`"
        class="absolute inset-0"
        :page-id="selectedPage.id"
        :page-slug="selectedPage.slug"
        :page-status="resolvePagePreviewStage(selectedPage)"
        :snapshot-url="selectedPage.snapshotUrl"
        :thumbnail-url="selectedPage.thumbnailUrl"
        :inert="true"
        item-type="page"
        viewport="desktop"
        fit-to-container
        thumbnail-fit="cover"
        thumbnail-position="top"
      />
      <div
        v-else
        class="flex size-full items-center justify-center"
      >
        <span
          :class="[studioIcons.designLayout, 'size-8 text-muted-foreground/35']"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Popover v-model:open="isPickerOpen">
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 shrink-0"
            :disabled="disabled"
          >
            {{ isConfigured ? t("collections.template.replacePage") : t("collections.template.choosePage") }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80 p-0" align="start">
          <Command>
            <CommandInput :placeholder="t('collections.template.searchPages')" />
            <CommandList>
              <CommandEmpty>{{ t("collections.template.noPages") }}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="page in pageOptions"
                  :key="page.id"
                  :value="`${page.label} ${page.slug}`"
                  @select="selectPage(page.id)"
                >
                  <span class="min-w-0 truncate">{{ page.label }}</span>
                  <span
                    v-if="pageOptionRoleLabel(page.systemRole)"
                    class="ml-2 shrink-0 text-[10px] uppercase tracking-wide"
                    :class="STATUS_TEXT.violet"
                  >
                    {{ pageOptionRoleLabel(page.systemRole) }}
                  </span>
                  <span class="ml-auto shrink-0 text-muted-foreground/70">
                    /{{ page.slug }}
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p
        v-if="pathHint"
        class="m-0 min-w-0 truncate text-xs text-muted-foreground"
        :title="pathHint"
      >
        {{ pathHint }}
      </p>
    </div>
  </article>
</template>
