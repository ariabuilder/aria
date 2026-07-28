<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
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
  isMarkupPreviewOpen,
  markupPreview,
  stylesheetPreview,
  setMarkupPreviewOpen,
  keepMarkupPreviewOpenOnHover,
  scheduleMarkupPreviewCloseOnHoverLeave,
} = useStageMarkupPreview();

const anchor = computed(() => toValue(props.anchorEl) ?? null);
const { top, left, width, height } = useElementBounding(anchor);
const isMarkupCopied = ref(false);
const isStylesheetCopied = ref(false);
const COPY_CONFIRMATION_DURATION_MS = 1_500;
let markupCopyConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
let stylesheetCopyConfirmationTimer: ReturnType<typeof setTimeout> | null = null;

const panelStyle = computed(() => ({
  top: `${top.value}px`,
  left: `${left.value}px`,
  width: `${width.value}px`,
  maxHeight: `${Math.max(height.value * 0.5, 160)}px`,
  zIndex: Z_INDEX.canvas.markupPreview,
}));

function showCopyConfirmation(
  copied: typeof isMarkupCopied,
  timer: "markup" | "stylesheet",
): void {
  const existingTimer =
    timer === "markup"
      ? markupCopyConfirmationTimer
      : stylesheetCopyConfirmationTimer;
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  copied.value = true;
  const confirmationTimer = setTimeout(() => {
    copied.value = false;
    if (timer === "markup") {
      markupCopyConfirmationTimer = null;
    } else {
      stylesheetCopyConfirmationTimer = null;
    }
  }, COPY_CONFIRMATION_DURATION_MS);

  if (timer === "markup") {
    markupCopyConfirmationTimer = confirmationTimer;
  } else {
    stylesheetCopyConfirmationTimer = confirmationTimer;
  }
}

async function copyMarkup(): Promise<void> {
  const markup = markupPreview.value.trim();
  if (!markup) {
    return;
  }

  try {
    await navigator.clipboard.writeText(markup);
    showCopyConfirmation(isMarkupCopied, "markup");
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
    showCopyConfirmation(isStylesheetCopied, "stylesheet");
    toast.success("Stylesheet copied");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to copy stylesheet",
    );
  }
}

onBeforeUnmount(() => {
  if (markupCopyConfirmationTimer) {
    clearTimeout(markupCopyConfirmationTimer);
  }
  if (stylesheetCopyConfirmationTimer) {
    clearTimeout(stylesheetCopyConfirmationTimer);
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="markup-preview">
      <section
        v-if="isMarkupPreviewOpen"
        data-testid="stage-markup-preview-panel"
        class="fixed grid overflow-hidden border-b border-dashed border-border bg-background shadow-none"
        :style="panelStyle"
        @click.stop
        @pointerdown.stop
        @mouseenter="keepMarkupPreviewOpenOnHover"
        @mouseleave="scheduleMarkupPreviewCloseOnHoverLeave"
      >
        <div class="min-h-0 overflow-y-auto">
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
                  :aria-label="isMarkupCopied ? 'Markup copied' : 'Copy markup'"
                  @click.stop="void copyMarkup()"
                  @pointerdown.stop
                >
                  <span
                    class="icon-swap"
                    :data-state="isMarkupCopied ? 'copied' : 'copy'"
                    aria-hidden="true"
                  >
                    <span
                      :class="[studioIcons.copy, 'icon-swap-icon size-3.5 shrink-0']"
                      data-icon="copy"
                    />
                    <span
                      :class="[studioIcons.checkLinear, 'icon-swap-icon size-3.5 shrink-0']"
                      data-icon="copied"
                    />
                  </span>
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
                  :aria-label="isStylesheetCopied ? 'Stylesheet copied' : 'Copy stylesheet'"
                  @click.stop="void copyStylesheet()"
                  @pointerdown.stop
                >
                  <span
                    class="icon-swap"
                    :data-state="isStylesheetCopied ? 'copied' : 'copy'"
                    aria-hidden="true"
                  >
                    <span
                      :class="[studioIcons.copy, 'icon-swap-icon size-3.5 shrink-0']"
                      data-icon="copy"
                    />
                    <span
                      :class="[studioIcons.checkLinear, 'icon-swap-icon size-3.5 shrink-0']"
                      data-icon="copied"
                    />
                  </span>
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
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.markup-preview-enter-active,
.markup-preview-leave-active {
  transition:
    grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms ease-out;
}

.markup-preview-enter-from,
.markup-preview-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.markup-preview-enter-to,
.markup-preview-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
}

.icon-swap {
  position: relative;
  display: inline-grid;
}

.icon-swap-icon {
  grid-area: 1 / 1;
  transition:
    opacity 250ms ease-in-out,
    filter 250ms ease-in-out,
    transform 250ms ease-in-out;
  will-change: opacity, filter, transform;
}

.icon-swap[data-state="copy"] [data-icon="copy"],
.icon-swap[data-state="copied"] [data-icon="copied"] {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
}

.icon-swap[data-state="copy"] [data-icon="copied"],
.icon-swap[data-state="copied"] [data-icon="copy"] {
  opacity: 0;
  filter: blur(2px);
  transform: scale(0.25);
}

@media (prefers-reduced-motion: reduce) {
  .markup-preview-enter-active,
  .markup-preview-leave-active,
  .icon-swap-icon {
    transition: none;
  }
}
</style>
