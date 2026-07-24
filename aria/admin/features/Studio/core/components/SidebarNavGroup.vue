<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import type { ComponentPublicInstance } from "vue";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { studioIcons } from "@/lib/icons";
import { resolveButtonEl } from "@/features/Studio/core/utils/resolveButtonEl";

const props = withDefaults(
  defineProps<{
    label: string;
    path: string;
    icon: string;
    groupId: string;
    open: boolean;
    active: boolean;
    collapsed: boolean;
    indicatorId?: string;
    renderChildren?: boolean;
  }>(),
  {
    renderChildren: true,
  },
);

const emit = defineEmits<{
  navigate: [path: string, groupId: string];
  toggle: [groupId: string];
  hover: [groupId: string];
  registerIndicator: [id: string, el: HTMLElement | null];
  indicatorEnter: [id: string];
}>();

//
// Custom position:fixed flyout teleported to <body>. No Popover/Portal
// library — we own the entire state machine so there's nothing for the
// framework to fight with. The flyout is positioned flush against the
// trigger's right edge (zero gap), so the cursor never leaves the hit
// area before reaching the flyout content.

const flyoutOpen = ref(false);
const flyoutTop = ref(0);
const flyoutLeft = ref(0);
const triggerRef = ref<HTMLElement>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const CLOSE_DELAY = 50; // ms — bridges micro-gaps between trigger & flyout

function cancelClose() {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function scheduleClose() {
  cancelClose();
  closeTimer = setTimeout(() => {
    flyoutOpen.value = false;
  }, CLOSE_DELAY);
}

function positionFlyout() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  // Left edge flush with the trigger's right edge — zero gap.
  flyoutTop.value = rect.top;
  flyoutLeft.value = rect.right;
}

function openFlyout() {
  cancelClose();
  positionFlyout();
  flyoutOpen.value = true;
}

function closeFlyout() {
  cancelClose();
  flyoutOpen.value = false;
}

function handleTriggerEnter() {
  emit("hover", props.groupId);
  handleIndicatorEnter();
  openFlyout();
}

function handleExpandedTriggerEnter() {
  emit("hover", props.groupId);
  handleIndicatorEnter();
}

function handleTriggerLeave() {
  scheduleClose();
}

function handleFlyoutEnter() {
  cancelClose();
}

function handleFlyoutLeave() {
  scheduleClose();
}

function handleChildClick() {
  closeFlyout();
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && flyoutOpen.value) {
    e.preventDefault();
    closeFlyout();
  }
}

function onDocumentClick(e: MouseEvent) {
  if (!flyoutOpen.value) return;
  const target = e.target as HTMLElement;
  // Ignore clicks inside the trigger button or flyout panel
  if (triggerRef.value?.contains(target)) return;
  if (target.closest("[data-flyout-panel]")) return;
  closeFlyout();
}

function onDocumentScroll() {
  if (flyoutOpen.value) positionFlyout();
}

function handleClick() {
  // Touch-friendly: in collapsed mode, first tap opens flyout, second navigates
  if (props.collapsed && !flyoutOpen.value) {
    openFlyout();
    return;
  }
  if (!props.collapsed && props.open) {
    emit("toggle", props.groupId);
    return;
  }
  closeFlyout();
  emit("navigate", props.path, props.groupId);
}

function handleChevronClick(e: MouseEvent) {
  e.stopPropagation();
  emit("toggle", props.groupId);
}

const buttonRef = ref<ComponentPublicInstance | null>(null);

function syncIndicatorTarget() {
  if (!props.indicatorId) return;
  emit(
    "registerIndicator",
    props.indicatorId,
    resolveButtonEl(buttonRef.value),
  );
}

function handleIndicatorEnter() {
  if (props.indicatorId) {
    emit("indicatorEnter", props.indicatorId);
  }
}

function buttonClasses() {
  const tone = props.active
    ? ""
    : "!text-muted-foreground/75 hover:!text-sidebar-foreground";
  if (props.collapsed) {
    return `sidebar-nav-target w-full justify-center py-2 h-10! font-medium! transition-[color,box-shadow,font-weight] duration-100 ${tone}`;
  }
  return `sidebar-nav-target w-full !justify-start gap-3 px-4 py-2 h-10! font-medium! transition-[color,box-shadow,font-weight] duration-100 ${tone}`;
}

onMounted(() => {
  syncIndicatorTarget();

  // Capture-phase listeners so they fire before any stopPropagation
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("scroll", onDocumentScroll, true);
});

onBeforeUnmount(() => {
  cancelClose();
  if (props.indicatorId) {
    emit("registerIndicator", props.indicatorId, null);
  }
  document.removeEventListener("keydown", onDocumentKeydown, true);
  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("scroll", onDocumentScroll, true);
});

watch(buttonRef, syncIndicatorTarget, { flush: "post" });
watch(() => [props.indicatorId, props.collapsed] as const, syncIndicatorTarget, {
  flush: "post",
});

watch(
  () => props.collapsed,
  () => {
    closeFlyout();
  },
  { flush: "post" },
);
</script>

<template>
  <div class="sidebar-item">
    <div
      v-if="collapsed"
      ref="triggerRef"
      @mouseenter="handleTriggerEnter"
      @mouseleave="handleTriggerLeave"
    >
      <Button
        ref="buttonRef"
        :variant="active ? 'nav-active' : 'nav'"
        :class="buttonClasses()"
        :aria-label="label"
        @click="handleClick"
      >
        <span :class="[icon, 'size-5 shrink-0', active && 'text-primary']" />
      </Button>
    </div>

    <Collapsible v-else :open="open">
      <Button
        ref="buttonRef"
        :variant="active ? 'nav-active' : 'nav'"
        :class="buttonClasses()"
        :aria-label="label"
        @mouseenter="handleExpandedTriggerEnter"
        @focusin="handleExpandedTriggerEnter"
        @click="handleClick"
      >
        <span :class="[icon, 'size-4.5 shrink-0', active && 'text-foreground']" />
        <span class="flex-1 text-left">{{ label }}</span>
        <span
          :class="[
            studioIcons.chevronDown,
            'size-3.5 shrink-0 transition-transform',
            open && 'rotate-180',
          ]"
          @click.stop="handleChevronClick"
        />
      </Button>
      <CollapsibleContent
        v-if="renderChildren"
        class="sidebar-group-content overflow-hidden"
      >
        <slot name="children" />
      </CollapsibleContent>
    </Collapsible>
  </div>

  <!-- Flyout panel (rendered outside the sidebar DOM tree) -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-50 linear"
      enter-from-class="opacity-0"
      enter-to-class="opacity-50"
      leave-active-class="transition duration-50 ease-in"
      leave-from-class="opacity-50"
      leave-to-class="opacity-0"
    >
      <div
        v-if="collapsed && flyoutOpen"
        data-flyout-panel
        :style="{
          position: 'fixed',
          top: `${flyoutTop}px`,
          left: `${flyoutLeft}px`,
          zIndex: 50,
        }"
        class="min-w-36 -mt-7.7 ml-1 rounded-sm border overflow-hidden border-solid border-border/50 bg-sidebar"
        @mouseenter="handleFlyoutEnter"
        @mouseleave="handleFlyoutLeave"
        @click="handleChildClick"
      >
        <!-- Group heading -->
        <div
          class="bg-sidebar border-b border-solid border-border/50 px-3 py-2 text-sm font-semibold text-muted-foreground select-none"
        >
          {{ label }}
        </div>
        <!--
          Children slot — reset expanded-mode indent/border/padding via
          arbitrary-variant overrides so they lay flat inside the flyout.
        -->
        <div
          class="bg-background/50 [&>div]:ml-0 [&>div]:border-l-0 [&>div]:pb-2 [&>div]:pt-1.5 [&>div]:px-1 [&>div]:pr-2 [&>div]:text-sm"
        >
          <slot name="children" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
