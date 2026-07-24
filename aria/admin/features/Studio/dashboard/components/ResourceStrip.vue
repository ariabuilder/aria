<script setup lang="ts">
import { computed } from "vue";
import { useBuilderData } from "@/composables/useBuilderData";
import { useCollectionsList } from "@/features/CMS/composables/useCollectionsList";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { isUserComponent } from "@/features/Studio/components/lib/isUserComponent";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
const router = useStudioRouter();
const { pages, components } = useBuilderData();
const { stats } = useCollectionsList();

const resources = computed(() => [
  {
    id: "pages",
    label: t("dashboard.content.pages"),
    count: pages.value.length,
    icon: studioIcons.pages,
    path: "/pages",
  },
  {
    id: "collections",
    label: t("dashboard.content.collections"),
    count: stats.value.total,
    icon: studioIcons.collections,
    path: "/collections",
  },
  {
    id: "entries",
    label: t("dashboard.content.entries"),
    count: stats.value.items,
    icon: studioIcons.list,
    path: "/collections",
  },
  {
    id: "components",
    label: t("dashboard.content.components"),
    count: components.value.filter(isUserComponent).length,
    icon: studioIcons.component,
    path: "/components",
  },
]);
</script>

<template>
  <div
    class="grid grid-cols-2 gap-3 lg:grid-cols-4"
    :aria-label="t('dashboard.content.title')"
  >
    <button
      v-for="resource in resources"
      :key="resource.id"
      type="button"
      class="group flex min-h-[4rem] w-full items-center justify-start rounded-sm border border-border/50 bg-card/20 px-5 py-5 text-left transition-colors hover:border-border hover:bg-card/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer justify-between"
      @click="router.navigateTo(resource.path)"
    >
      <span class="flex min-w-0 flex-row justify-between items-center gap-1">
        <span
        :class="[
          resource.icon,
          'mr-4 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5',
        ]"
        aria-hidden="true"
      />
        <span class="text-sm text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 tracking-wide">
          {{ resource.label }}
        </span>
      </span>
      <span
          class="font-sans text-lg font-medium leading-none tabular-nums text-foreground/80 group-hover:text-foreground transition-transform group-hover:-translate-x-0.5"
        >
          {{ resource.count }}
        </span>

    </button>
  </div>
</template>
