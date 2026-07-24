<script setup lang="ts">
import { computed } from "vue";
import { studioIcons } from "@/lib/icons";
import type { AgentToolStep, ConfirmationCategory } from "../../lib/schemas";
import AgentToolErrorBlock from "./AgentToolErrorBlock.vue";
import AgentToolApprovalCard from "./AgentToolApprovalCard.vue";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  aria_list_pages: "List pages",
  aria_read_page: "Read page",
  aria_list_components: "List components",
  aria_read_component: "Read component",
  aria_list_layouts: "List layouts",
  aria_read_layout: "Read layout",
  aria_get_design_system: "Get design system",
  aria_list_element_types: "Check page structure",
  aria_set_design_system_primary_color: "Set primary color",
  aria_save_design_system_colors: "Save colors",
  aria_save_design_system_typography: "Save typography",
  aria_save_design_system_global_styles: "Save global styles",
  aria_save_design_system_breakpoints: "Save breakpoints",
  aria_apply_design_system_template: "Apply template",
  aria_update_page_meta: "Update page meta",
  aria_delete_document: "Delete document",
  aria_manage_css_variables: "Manage CSS variables",
  insert_designed_section: "Design section",
  insert_nodes: "Add page content",
  select_block: "Select content",
  open_in_composer: "Open page",
};

const props = defineProps<{
  step: AgentToolStep;
}>();

const displayName = computed(
  () =>
    TOOL_DISPLAY_NAMES[props.step.toolName] ??
    (props.step.isReadTool ? "Review site" : "Apply update"),
);
</script>

<template>
  <div
    class="rounded-sm border border-border/50 bg-background mt-2 px-2 py-2 text-xs"
  >
    <div class="flex items-center gap-2">
      <span
        v-if="step.status === 'running'"
        :class="[
          studioIcons.loading,
          'size-3.5 animate-spin text-muted-foreground',
        ]"
      />
      <span
        v-else-if="step.status === 'success'"
        :class="[studioIcons.checkLinear, 'size-3.5 text-emerald-600']"
      />
      <span v-else :class="[studioIcons.close, 'size-3.5 text-destructive']" />
      <span class="font-medium">{{ displayName }}</span>
      <span v-if="step.summary" class="text-muted-foreground">{{
        step.summary
      }}</span>
    </div>
    <AgentToolApprovalCard
      v-if="
        step.error?.code === 'CONFIRMATION_REQUIRED' &&
        step.error.confirmationToken
      "
      :tool-name="step.toolName"
      :action-label="displayName"
      :category="step.error.confirmationCategory as ConfirmationCategory"
      :confirmation-token="step.error.confirmationToken"
      class="mt-2"
    />
    <AgentToolErrorBlock
      v-else-if="step.error && step.error.code !== 'CONFIRMATION_REQUIRED'"
      :error="step.error"
      class="mt-1"
    />
  </div>
</template>
