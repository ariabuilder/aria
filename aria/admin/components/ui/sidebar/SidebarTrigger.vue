<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const { toggleSidebar } = useSidebar();
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon"
    :class="cn('h-7 w-7', props.class)"
    @click="toggleSidebar"
  >
    <span
      aria-hidden="true"
      :class="[studioIcons.sidebarMinimal, 'size-4 shrink-0']"
    />
    <span class="sr-only">Toggle Sidebar</span>
  </Button>
</template>
