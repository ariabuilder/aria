<script setup lang="ts">
/**
 * InspectorTabs - Tab Navigation Component
 *
 * Tab bar for switching between Design, Props, and Logic tabs.
 *
 * @component
 */
import type { InspectorTab } from "../types/inspector";
import { studioIcons } from "@/lib/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioI18n } from "@/i18n";

// PROPS & EMITS

interface Props {
  activeTab: InspectorTab;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  "update:activeTab": [tab: InspectorTab];
}>();

const { t } = useStudioI18n();

const tabs: Array<{ id: InspectorTab; label: string; icon: string }> = [
  { id: "design", label: t("inspector.tabs.design"), icon: studioIcons.design },
  { id: "props", label: t("inspector.tabs.props"), icon: studioIcons.inspectorTabProps },
  { id: "motion", label: t("inspector.tabs.motion"), icon: studioIcons.lightning },
];

function handleTabClick(tab: InspectorTab) {
  if (!props.disabled) {
    emit("update:activeTab", tab);
  }
}
</script>

<template>
  <div class="flex border-b border-border/50 border-dashed h-12">
    <TooltipProvider v-for="tab in tabs" :key="tab.id">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            @click="handleTabClick(tab.id)"
            :disabled="disabled"
            :class="[
              'relative flex-1 overflow-hidden flex items-center justify-center text-xs font-serif font-medium transition-colors',
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed',
            ]"
          >
            <div :class="[tab.icon, 'relative z-10 w-4.5 h-4.5']" />
            <span
              aria-hidden="true"
              :class="[
                'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 z-20 origin-left bg-primary transition-transform duration-150 ease-out',
                activeTab === tab.id ? 'scale-x-100' : 'scale-x-0',
              ]"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" class="text-xs">
          {{ tab.label }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
