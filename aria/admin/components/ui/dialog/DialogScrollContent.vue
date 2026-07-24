<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { computed } from "vue";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes["class"];
      /** When true, the overlay does not scroll (use for fixed-height dialogs). */
      lockOverlayScroll?: boolean;
      /** Keeps the overlay visible during theme View Transitions. */
      preserveOnThemeTransition?: boolean;
    }
  >(),
  {
    lockOverlayScroll: false,
    preserveOnThemeTransition: false,
  },
);
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = reactiveOmit(
  props,
  "class",
  "lockOverlayScroll",
  "preserveOnThemeTransition",
);

const forwarded = useForwardPropsEmits(delegatedProps, emits);

const overlayClass = computed(() =>
  props.lockOverlayScroll
    ? "grid place-items-center overflow-hidden"
    : "grid place-items-center overflow-y-auto",
);

const overlayStyle = computed(() =>
  props.preserveOnThemeTransition
    ? ({ viewTransitionName: "aria-settings" } as const)
    : undefined,
);
</script>

<template>
  <DialogPortal>
    <DialogOverlay :class="overlayClass" :style="overlayStyle">
      <DialogContent
        :class="
          cn(
            'relative z-50 grid w-full max-w-lg my-8 gap-4 border border-border bg-background shadow-lg dark:shadow-none rounded-md duration-200 md:w-full',
            props.class,
          )
        "
        v-bind="{ ...$attrs, ...forwarded }"
        @pointer-down-outside="
          (event) => {
            const originalEvent = event.detail.originalEvent;
            const target = originalEvent.target as HTMLElement;
            if (
              originalEvent.offsetX > target.clientWidth ||
              originalEvent.offsetY > target.clientHeight
            ) {
              event.preventDefault();
            }
          }
        "
      >
        <slot />

        <DialogClose
          class="absolute top-5.5 right-8 transition-colors hover:text-destructive"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.close, 'size-4 shrink-0']"
          />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
