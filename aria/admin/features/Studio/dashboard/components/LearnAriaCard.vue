<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import DashboardFrame from "./DashboardFrame.vue";

const { t } = useStudioI18n();

const guides = [
  {
    id: "first-site",
    title: "Your first site",
    category: "Start",
    icon: studioIcons.home,
    href: "https://ariabuilder.io/docs/getting-started/first-site/",
  },
  {
    id: "collection",
    title: "Create a collection",
    category: "CMS",
    icon: studioIcons.databaseLine,
    href: "https://ariabuilder.io/docs/tutorials/collections/create-a-collection/",
  },
  {
    id: "entry",
    title: "Create an entry",
    category: "CMS",
    icon: studioIcons.list,
    href: "https://ariabuilder.io/docs/tutorials/collections/entries/create-an-entry/",
  },
  {
    id: "analytics",
    title: "Analytics settings",
    category: "Traffic",
    icon: studioIcons.chart,
    href: "https://ariabuilder.io/docs/tutorials/settings/analytics/",
  },
  {
    id: "content-sync",
    title: "Sync local and remote content",
    category: "Deploy",
    icon: studioIcons.arrowReloadHorizontal,
    href: "https://ariabuilder.io/docs/deployment/content-sync/",
  },
  {
    id: "cloudflare",
    title: "Deploy to Cloudflare",
    category: "Deploy",
    icon: studioIcons.upload,
    href: "https://ariabuilder.io/docs/deployment/cloudflare/",
  },
] as const;
</script>

<template>
  <DashboardFrame class="min-h-[20rem]">
    <div class="flex items-center justify-between px-5 py-4">
      <span class="section-kicker">{{ t("dashboard.learn.title") }}</span>
      <a
        href="https://ariabuilder.io/docs/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-3xs uppercase tracking-[0.12em] text-primary hover:text-foreground"
      >
        {{ t("dashboard.learn.docs") }}
      </a>
    </div>

    <div class="border-t border-dashed border-border">
      <Button
        v-for="guide in guides"
        :key="guide.id"
        as="a"
        :href="guide.href"
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        class="group grid h-11! w-full grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] justify-stretch gap-3 rounded-none border-b border-dashed border-border px-5! font-normal! last:border-b-0"
      >
        <span :class="[guide.icon, 'size-3.5 text-primary']" aria-hidden="true" />
        <span class="text-left font-mono text-3xs uppercase tracking-[0.1em] text-muted-foreground/65">
          {{ guide.category }}
        </span>
        <span class="truncate text-left text-xs text-foreground">{{ guide.title }}</span>
        <span
          :class="[
            studioIcons.arrowUpRight,
            'size-3 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
          ]"
          aria-hidden="true"
        />
      </Button>
    </div>
  </DashboardFrame>
</template>

<style scoped>
.section-kicker {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--foreground);
  text-transform: uppercase;
}
</style>
