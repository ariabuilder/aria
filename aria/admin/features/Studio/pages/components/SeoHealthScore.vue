<script setup lang="ts">
import { studioIcons } from "@/lib/icons";

export interface SeoCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "error";
  message?: string;
}

interface Props {
  score: number;
  checks: SeoCheck[];
}

defineProps<Props>();

function getCheckIcon(status: SeoCheck["status"]): string {
  switch (status) {
    case "pass":
      return studioIcons.check;
    case "warning":
      return studioIcons.warning;
    case "error":
      return studioIcons.close;
  }
}

function getStatusColor(status: SeoCheck["status"]): string {
  switch (status) {
    case "pass":
      return "text-emerald-400";
    case "warning":
      return "text-amber-400";
    case "error":
      return "text-red-400";
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex h-9 items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Checks
      </h2>
      <span class="text-sm text-foreground">{{ score }}</span>
    </div>

    <div class="space-y-1">
      <div
        v-for="check in checks"
        :key="check.id"
        class="flex min-h-9 items-center gap-2 rounded-md px-2"
      >
        <span
          :class="[
            getCheckIcon(check.status),
            'size-3.5 shrink-0',
            getStatusColor(check.status),
          ]"
        />
        <div class="min-w-0">
          <span class="text-xs text-foreground">{{ check.label }}</span>
          <span
            v-if="check.message"
            class="ml-2 text-2xs text-muted-foreground"
          >
            {{ check.message }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
