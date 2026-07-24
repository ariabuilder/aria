<script setup lang="ts">
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useElementBounding } from "@vueuse/core";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { Z_INDEX } from "@/lib/zIndex";
import { Textarea } from "@/components/ui/textarea";
import { useStageMarkupPreview } from "../composables/useStageMarkupPreview";

const props = defineProps<{
  anchorEl?: MaybeRefOrGetter<HTMLElement | null | undefined>;
}>();

const {
  markupPreview,
  stylesheetPreview,
  setMarkupPreviewOpen,
  keepMarkupPreviewOpenOnHover,
  scheduleMarkupPreviewCloseOnHoverLeave,
} = useStageMarkupPreview();

const anchor = computed(() => toValue(props.anchorEl) ?? null);
const { top, left, width, height } = useElementBounding(anchor);

const panelStyle = computed(() => ({
  top: `${top.value}px`,
  left: `${left.value}px`,
  width: `${width.value}px`,
  maxHeight: `${Math.max(height.value * 0.5, 160)}px`,
  zIndex: Z_INDEX.canvas.markupPreview,
}));

async function copyMarkup(): Promise<void> {
  const markup = markupPreview.value.trim();
  if (!markup) {
    return;
  }

  try {
    await navigator.clipboard.writeText(markup);
    toast.success("Markup copied");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to copy markup",
    );
  }
}

async function copyStylesheet(): Promise<void> {
  const stylesheet = stylesheetPreview.value.trim();
  if (!stylesheet) {
    return;
  }

  try {
    await navigator.clipboard.writeText(stylesheet);
    toast.success("Stylesheet copied");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to copy stylesheet",
    );
  }
}
</script>

<template>
  <Teleport to="body">
    <section
      data-testid="stage-markup-preview-panel"
      class="fixed overflow-y-auto border-b border-dashed border-border bg-sidebar shadow-lg"
      :style="panelStyle"
      @click.stop
      @pointerdown.stop
      @mouseenter="keepMarkupPreviewOpenOnHover"
      @mouseleave="scheduleMarkupPreviewCloseOnHoverLeave"
    >
      <div class="space-y-3 p-2 font-mono text-xs">
        <div class="flex items-center justify-between gap-2 px-1">
          <p class="text-sm font-serif font-medium text-foreground">
            Markup Preview
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close markup preview"
            @click="setMarkupPreviewOpen(false)"
          >
            <span :class="[studioIcons.close, 'size-4 shrink-0']" aria-hidden="true" />
          </Button>
        </div>

        <div class="space-y-1">
          <div class="flex items-center gap-1 px-2">
            <p class="text-xs font-serif font-medium text-muted-foreground">
              Markup
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Copy markup"
              @click.stop="void copyMarkup()"
              @pointerdown.stop
            >
              <span :class="[studioIcons.copy, 'size-3.5 shrink-0']" aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            :model-value="markupPreview"
            readonly
            rows="1"
            class="min-h-0 resize-none border-0 bg-transparent px-2 py-2 font-mono text-xs text-muted-foreground shadow-none field-sizing-content selection:bg-primary/15 selection:text-foreground focus-visible:border-0"
          />
        </div>

        <div class="space-y-1 pb-1">
          <div class="flex items-center gap-1 px-2">
            <p class="text-xs font-serif font-medium text-muted-foreground">
              Stylesheet
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Copy stylesheet"
              @click.stop="void copyStylesheet()"
              @pointerdown.stop
            >
              <span :class="[studioIcons.copy, 'size-3.5 shrink-0']" aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            :model-value="stylesheetPreview"
            readonly
            rows="1"
            class="min-h-0 resize-none border-0 bg-transparent px-2 py-2 font-mono text-xs text-muted-foreground shadow-none field-sizing-content selection:bg-primary/15 selection:text-foreground focus-visible:border-0"
          />
        </div>
      </div>
    </section>
  </Teleport>
</template>
