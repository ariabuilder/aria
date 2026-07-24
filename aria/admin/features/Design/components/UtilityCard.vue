<script setup lang="ts">
/**
 * FrameworkCard - Reusable card for utility engine/library display Five stacked
 * zones: header (icon + version badge), title + description.
 */
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  name: string;
  description: string;
  version: string;
  tags: string[];
  status: "active" | "inactive";
  statusText: string;
  actionLabel: string;
  actionDisabled?: boolean;
  actionVariant?: "primary" | "secondary";
  websiteUrl: string;
}>();

const emit = defineEmits<{
  action: [];
}>();

const STATUS_DOT_CLASS: Record<string, string> = {
  active: "bg-primary shadow-[0_0_0_3px] shadow-primary/20",
  inactive: "bg-muted-foreground/30",
};
</script>

<template>
  <article
    class="flex flex-col gap-0 rounded-md border border-border border-dashed bg-background hover:bg-card/10 p-6 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
  >
    <!-- Zone 1: Header - Icon + Version -->
    <div class="flex items-start justify-between select-none">
      <div class="flex min-h-20 items-center justify-start">
        <template v-if="websiteUrl">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="websiteUrl"
                :aria-label="`Visit ${name}`"
                target="_blank"
                rel="noreferrer noopener"
              >
                <slot name="icon" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              Learn more about {{ name }}
            </TooltipContent>
          </Tooltip>
        </template>
        <slot v-else name="icon" />
      </div>
      <span
        class="shrink-0 rounded-sm border border-border border-dashed bg-muted px-3 py-1.5 text-2xs font-mono text-muted-foreground tabular-nums"
      >
        {{ version }}
      </span>
    </div>

    <!-- Zone 2: Title + Description -->
    <div class="mt-5 space-y-2">
      <h3
        class="text-2xl font-serif font-medium text-foreground tracking-tight leading-0"
      >
        {{ name }}
      </h3>
      <p
        class="text-sm text-balance leading-relaxed text-muted-foreground line-clamp-3"
      >
        {{ description }}
      </p>
    </div>

    <!-- Zone 3: Tags -->
    <div v-if="tags.length > 0" class="mt-4 flex flex-wrap gap-2">
      <span
        v-for="tag in tags"
        :key="tag"
        class="rounded-sm border border-border border-dashed bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground"
      >
        {{ tag }}
      </span>
    </div>

    <!-- Zone 4: Divider -->
    <hr class="my-5 border-t border-border" />

    <!-- Zone 5: Footer - Status + Action -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          :class="[
            'size-2 rounded-full',
            STATUS_DOT_CLASS[status] ?? STATUS_DOT_CLASS.inactive,
          ]"
        />
        <span
          :class="[
            'text-sm',
            status === 'active'
              ? 'font-medium text-primary'
              : 'text-muted-foreground',
          ]"
        >
          {{ statusText }}
        </span>
      </div>

      <Button
        :variant="actionVariant === 'primary' ? 'default' : 'outline'"
        size="sm"
        :disabled="actionDisabled"
        @click="emit('action')"
      >
        <span
          :class="[
            'size-3.5 mr-1.5',
            actionVariant === 'primary' ? studioIcons.add : studioIcons.check,
          ]"
        />
        {{ actionLabel }}
      </Button>
    </div>
  </article>
</template>
