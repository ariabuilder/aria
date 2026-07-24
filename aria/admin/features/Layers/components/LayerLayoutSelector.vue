<script setup lang="ts">
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { studioIcons } from "@/lib/icons";
import type { LayoutDSL } from "../../../../lib/types/nodes";

interface LayoutInfo {
  id?: string;
  name?: string;
}

const props = defineProps<{
  currentLayout?: LayoutInfo;
  currentLayoutDisplayName: string;
  availableLayouts: LayoutDSL[];
  isLoadingLayouts: boolean;
}>();

const emit = defineEmits<{
  "update-layout": [layoutSlug: string];
}>();

const handleLayoutChange = (layoutSlug: string): void => {
  emit("update-layout", layoutSlug);
};
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button
        class="w-full flex items-center gap-2 px-2 h-9 text-xs border border-border rounded-xs transition-colors bg-card text-foreground hover:bg-accent"
      >
        <div
          :class="[studioIcons.windowFrame, 'shrink-0 opacity-70 w-3 h-3']"
        />
        <span class="flex-1 text-left font-medium truncate">
          {{ props.currentLayoutDisplayName }}
        </span>
        <div
          :class="[studioIcons.chevronDown, 'shrink-0 opacity-50 w-2.5 h-2.5']"
        />
      </button>
    </PopoverTrigger>

    <PopoverContent
      align="start"
      class="w-58 mt-1 p-0 bg-popover border-border"
    >
      <div
        v-if="props.isLoadingLayouts"
        class="p-3 text-center text-xs text-muted-foreground"
      >
        Loading layouts...
      </div>

      <div v-else class="p-1 space-y-1 max-h-80 overflow-y-auto">
        <button
          @click="handleLayoutChange('')"
          :class="[
            'w-full p-2 text-left rounded border transition-all',
            !props.currentLayout
              ? 'bg-primary/10 border-primary/20 text-foreground'
              : 'border-transparent hover:bg-accent text-foreground',
          ]"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex items-center justify-center w-6 h-6 rounded bg-muted border border-border shrink-0"
            >
              <div :class="[studioIcons.windowFrame, 'w-3 h-3']" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium">No Layout</span>
                <div
                  v-if="!props.currentLayout"
                  :class="[studioIcons.checkCircleLinear, 'text-primary w-2.5 h-2.5']"
                />
              </div>
            </div>
          </div>
        </button>

        <button
          v-for="layout in props.availableLayouts"
          :key="layout.id"
          @click="handleLayoutChange(layout.id)"
          :class="[
            'w-full p-2 text-left rounded border transition-all',
            props.currentLayout?.id === layout.id
              ? 'bg-primary/10 border-primary/30 text-foreground'
              : 'border-transparent hover:bg-accent text-foreground',
          ]"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex items-center justify-center w-6 h-6 rounded bg-muted border border-border shrink-0"
            >
              <div :class="[studioIcons.windowFrame, 'w-3 h-3']" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium truncate">{{
                  layout.name
                }}</span>
                <div
                  v-if="props.currentLayout?.id === layout.id"
                  :class="[studioIcons.checkCircleLinear, 'text-primary w-2.5 h-2.5']"
                />
              </div>
              <p class="text-[10px] text-muted-foreground line-clamp-1">
                {{ layout.description }}
              </p>
            </div>
          </div>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
