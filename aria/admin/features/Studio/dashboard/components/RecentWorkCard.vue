<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBuilderData } from "@/composables/useBuilderData";
import { useCollectionsList } from "@/features/CMS/composables/useCollectionsList";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { isUserComponent } from "@/features/Studio/components/lib/isUserComponent";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import DashboardFrame from "./DashboardFrame.vue";

interface RecentItem {
  id: string;
  title: string;
  kind: "page" | "collection" | "component";
  detail: string;
  updatedAt: string | null;
  path: string;
  icon: string;
}

const { t } = useStudioI18n();
const router = useStudioRouter();
const { pages, components } = useBuilderData();
const { collections } = useCollectionsList();

const recentItems = computed<RecentItem[]>(() => {
  const pageItems = pages.value
    .filter((page) => page.systemRole !== "not-found")
    .map((page) => ({
      id: `page:${page.id}`,
      title: page.title,
      kind: "page" as const,
      detail: t(`dashboard.status.${page.status}`),
      updatedAt: page.updatedAt,
      path: `/pages/${page.slug}`,
      icon: studioIcons.page,
    }));

  const collectionItems = collections.value.map((collection) => ({
    id: `collection:${collection.id}`,
    title: collection.label,
    kind: "collection" as const,
    detail: t("dashboard.content.entryCount", { count: collection.itemCount }),
    updatedAt: collection.updatedAt,
    path: `/collections/${collection.name}`,
    icon: studioIcons.databaseLine,
  }));

  const componentItems = components.value
    .filter(isUserComponent)
    .map((component) => ({
      id: `component:${component.id}`,
      title: component.name,
      kind: "component" as const,
      detail: component.category ?? t("dashboard.content.component"),
      updatedAt: component.updatedAt,
      path: `/components/${component.id}`,
      icon: studioIcons.component,
    }));

  return [...pageItems, ...collectionItems, ...componentItems]
    .sort(
      (left, right) =>
        new Date(right.updatedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? 0).getTime(),
    )
    .slice(0, 5);
});
</script>

<template>
  <DashboardFrame class="min-h-[17rem]">
    <div class="flex items-center justify-between px-5 py-4">
      <h2 class="m-0 text-sm font-medium text-foreground">
        {{ t("dashboard.recent.title") }}
      </h2>
      <span
        :class="[studioIcons.activity, 'size-4 text-primary']"
        aria-hidden="true"
      />
    </div>

    <div class="border-t border-border/50">
      <Button
        v-for="item in recentItems"
        :key="item.id"
        variant="ghost"
        class="group grid h-10! w-full grid-cols-[minmax(0,1fr)_auto_auto] justify-stretch gap-4 rounded-none border-b border-border/50 px-5! text-left font-normal! last:border-b-0"
        @click="router.navigateTo(item.path)"
      >
        <span class="flex min-w-0 items-center gap-3">
          <span
            :class="[item.icon, 'size-3.5 shrink-0 text-primary']"
            aria-hidden="true"
          />
          <span class="truncate text-xs text-foreground">{{ item.title }}</span>
        </span>
        <Badge
          variant="outline"
          size="xs"
          class="hidden max-w-36 truncate rounded-md text-muted-foreground sm:inline-flex"
        >
          {{ item.detail }}
        </Badge>
        <span class="flex items-center gap-3 text-2xs text-muted-foreground/65">
          <span class="hidden tabular-nums md:inline">{{
            formatRelativeTime(item.updatedAt ?? undefined)
          }}</span>
          <span
            :class="[
              studioIcons.chevronRight,
              'size-3 transition-transform group-hover:translate-x-0.5',
            ]"
            aria-hidden="true"
          />
        </span>
      </Button>

      <div
        v-if="recentItems.length === 0"
        class="flex min-h-40 items-center justify-center text-xs text-muted-foreground"
      >
        {{ t("dashboard.recent.empty") }}
      </div>
    </div>
  </DashboardFrame>
</template>
