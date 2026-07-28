<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import { useClassEditor } from "@/features/Inspector/composables/useClassEditor";
import { useDesignWorkbenchDialog } from "../composables/useDesignWorkbenchDialog";

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const classEditor = useClassEditor();
const workbench = useDesignWorkbenchDialog();

function openWorkbench(): void {
  workbench.open("classes", {
    highlightClass: classEditor.activeClassName.value ?? undefined,
  });
}
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Classes and variables"
          class="mr-1.5!"
          :disabled="props.disabled"
          @click="openWorkbench"
        >
          <span :class="[studioIcons.layers, 'size-3.5 shrink-0']" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Classes &amp; variables</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
