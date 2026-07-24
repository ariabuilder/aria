<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import DashboardFrame from "./DashboardFrame.vue";

interface StructureRow {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  depth: number;
  isHome: boolean;
}

const MAX_ROWS = 10;

const { t } = useStudioI18n();
const router = useStudioRouter();
const { pages } = useBuilderData();

const structureRows = computed<StructureRow[]>(() => {
  const usable = pages.value.filter(
    (page) => page.systemRole !== "not-found",
  );

  const bySlug = new Map(usable.map((page) => [page.slug, page]));
  const childrenByParent = new Map<string | null, typeof usable>();

  for (const page of usable) {
    const parentSlug = page.parent?.trim() || null;
    const parentKey =
      parentSlug && bySlug.has(parentSlug) ? parentSlug : null;
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(page);
    childrenByParent.set(parentKey, bucket);
  }

  const sortPages = (list: typeof usable) =>
    [...list].sort((left, right) => {
      const leftHome = left.slug === "index" || left.slug === "home";
      const rightHome = right.slug === "index" || right.slug === "home";
      if (leftHome !== rightHome) return leftHome ? -1 : 1;
      return left.title.localeCompare(right.title);
    });

  const rows: StructureRow[] = [];

  function walk(parentKey: string | null, depth: number): void {
    const children = sortPages(childrenByParent.get(parentKey) ?? []);
    for (const page of children) {
      if (rows.length >= MAX_ROWS) return;
      rows.push({
        id: page.id,
        title: page.title,
        slug: page.slug,
        status: page.status,
        depth,
        isHome: page.slug === "index" || page.slug === "home",
      });
      walk(page.slug, depth + 1);
    }
  }

  walk(null, 0);
  return rows;
});

const remainingCount = computed(() => {
  const total = pages.value.filter(
    (page) => page.systemRole !== "not-found",
  ).length;
  return Math.max(0, total - structureRows.value.length);
});

function openPage(slug: string): void {
  router.navigateTo(`/pages/${slug}`);
}

function openPages(): void {
  router.navigateTo("/pages");
}
</script>

<template>
  <DashboardFrame class="flex min-h-[17rem] flex-col">
    <div class="flex items-center justify-between gap-3 px-5 py-4">
      <div class="min-w-0">
        <h2 class="m-0 text-sm font-medium text-foreground">
          {{ t("dashboard.structure.title") }}
        </h2>
        <p class="mt-1 text-2xs text-muted-foreground">
          {{ t("dashboard.structure.description") }}
        </p>
      </div>
      <Button
        variant="ghost"
        size="xs"
        class="shrink-0 rounded-md text-muted-foreground hover:text-foreground"
        @click="openPages"
      >
        {{ t("dashboard.structure.viewAll") }}
        <span
          :class="[studioIcons.arrowRight, 'size-3.5']"
          aria-hidden="true"
        />
      </Button>
    </div>

    <div class="min-h-0 flex-1 border-t border-border/50">
      <Button
        v-for="row in structureRows"
        :key="row.id"
        variant="ghost"
        class="group grid h-10! w-full grid-cols-[minmax(0,1fr)_auto] justify-stretch gap-3 rounded-none border-b border-border/50 px-5! text-left font-normal! last:border-b-0"
        :style="{ paddingLeft: `${1.25 + row.depth * 0.75}rem` }"
        @click="openPage(row.slug)"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <span
            :class="[
              row.isHome ? studioIcons.home : studioIcons.page,
              'size-3.5 shrink-0 text-primary',
            ]"
            aria-hidden="true"
          />
          <span class="truncate text-xs text-foreground">{{ row.title }}</span>
        </span>
        <Badge
          variant="outline"
          size="xs"
          class="rounded-md text-muted-foreground"
        >
          {{ t(`dashboard.status.${row.status}`) }}
        </Badge>
      </Button>

      <div
        v-if="structureRows.length === 0"
        class="flex min-h-40 flex-col items-center justify-center gap-3 px-5 text-center"
      >
        <p class="m-0 text-xs text-muted-foreground">
          {{ t("dashboard.structure.empty") }}
        </p>
        <Button variant="outline" size="xs" class="rounded-md" @click="openPages">
          {{ t("dashboard.structure.createPage") }}
        </Button>
      </div>
    </div>

    <div
      v-if="remainingCount > 0"
      class="border-t border-border/50 px-5 py-3"
    >
      <Button
        variant="ghost"
        size="xs"
        class="h-auto! w-full justify-start rounded-md px-0! text-2xs text-muted-foreground hover:bg-transparent hover:text-foreground"
        @click="openPages"
      >
        {{ t("dashboard.structure.more", { count: remainingCount }) }}
      </Button>
    </div>
  </DashboardFrame>
</template>
