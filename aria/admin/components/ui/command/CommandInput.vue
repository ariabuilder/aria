<script setup lang="ts">
import type { ListboxFilterProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  injectListboxRootContext,
  ListboxFilter,
  useForwardProps,
} from "reka-ui";
import { nextTick, onMounted, ref, watch } from "vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { useCommand } from ".";
import {
  handleCommandInputKeydown,
  resetCommandKeyboardNavigation,
} from "./commandInputNavigation";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ListboxFilterProps & {
    class?: HTMLAttributes["class"];
    wrapperClass?: HTMLAttributes["class"];
  }
>();

const modelValue = defineModel<string>({ default: "" });

const delegatedProps = reactiveOmit(props, "class", "wrapperClass");

const forwardedProps = useForwardProps(delegatedProps);

const { filterState } = useCommand();
const rootContext = injectListboxRootContext();
const wrapperRef = ref<HTMLElement | null>(null);

function getListRoot(): ParentNode {
  return wrapperRef.value?.closest('[data-slot="command"]') ?? document;
}

onMounted(() => {
  if (modelValue.value) {
    filterState.search = modelValue.value;
  }

  const listRoot = getListRoot();
  resetCommandKeyboardNavigation(listRoot);
  // Clear Reka highlightSelected (runs on nextTick after items mount).
  nextTick(() => {
    nextTick(() => {
      rootContext.onLeave(new FocusEvent("focusout"));
    });
  });
});

watch(
  () => filterState.search,
  (value) => {
    if (modelValue.value !== value) {
      modelValue.value = value;
    }
  },
);

watch(modelValue, (value) => {
  if (filterState.search !== value) {
    filterState.search = value;
  }
  resetCommandKeyboardNavigation(getListRoot());
});

async function onFilterKeydownCapture(event: KeyboardEvent): Promise<void> {
  const listRoot =
    event.target instanceof HTMLElement
      ? event.target.closest('[data-slot="command"]')
      : null;
  await handleCommandInputKeydown(event, rootContext, listRoot ?? document);
}
</script>

<template>
  <div
    ref="wrapperRef"
    data-slot="command-input-wrapper"
    :class="cn('flex items-center gap-2 px-3 py-1.5', props.wrapperClass)"
    @keydown.capture="onFilterKeydownCapture"
  >
    <span
      :class="[
        studioIcons.search,
        'size-3.5 shrink-0 text-muted-foreground/60  group-hover:text-muted-foreground/80',
      ]"
    />
    <ListboxFilter
      v-bind="{ ...forwardedProps, ...$attrs }"
      v-model="filterState.search"
      data-slot="command-input"
      :class="
        cn(
          'placeholder:text-muted-foreground/60 border-none flex h-9 w-full rounded-none bg-transparent py-2 text-sm text-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 caret-primary selection:bg-primary/10 selection:text-primary-foreground group-hover:text-primary-foreground',
          props.class,
        )
      "
    />
  </div>
</template>
