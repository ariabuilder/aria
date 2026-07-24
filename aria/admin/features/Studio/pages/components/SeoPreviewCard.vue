<script setup lang="ts">
import { computed } from "vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  title: string;
  description: string;
  url: string;
  favicon?: string;
  titleLengthWarning?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  favicon: "",
  titleLengthWarning: false,
});
const { t } = useStudioI18n();

const displayUrl = computed(() => {
  try {
    const u = new URL(props.url);
    return u.hostname + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    return props.url;
  }
});

const truncatedDescription = computed(() => {
  if (props.description.length > 160) {
    return props.description.slice(0, 157) + "...";
  }
  return props.description;
});
</script>

<template>
  <div class="w-full overflow-hidden rounded-md border border-border bg-card/20">
    <div class="flex items-center justify-between gap-3 px-4 pt-4">
      <p class="m-0 text-sm font-semibold leading-none text-foreground">
        {{ t("pages.seo.searchPreview") }}
      </p>
      <span class="text-2xs text-muted-foreground/70">{{ t("pages.seo.googleStyle") }}</span>
    </div>

    <div class="px-4 pb-4 pt-3">
      <div class="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div class="space-y-1.5">
          <div class="flex min-w-0 items-center gap-2">
            <div class="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted">
              <span v-if="favicon" class="text-2xs">{{ favicon.charAt(0) }}</span>
            </div>
            <span class="truncate text-xs text-muted-foreground">{{ displayUrl }}</span>
          </div>
          <h3
            class="m-0 truncate text-sm font-medium text-primary"
            :class="{ 'text-amber-400': titleLengthWarning }"
          >
            {{ title || t("pages.seo.untitled") }}
          </h3>
          <p class="m-0 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {{ truncatedDescription || t("pages.seo.noDescription") }}
          </p>
        </div>

        <div
          v-if="titleLengthWarning"
          class="mt-3 border-t border-dashed border-border/70 pt-3"
        >
          <p class="m-0 text-xs text-amber-400">
            {{ t("pages.seo.titleTruncated") }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
