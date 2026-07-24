<script setup lang="ts">
import { ref, computed, useSlots } from "vue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n, type StudioMessageKey } from "@/i18n";

interface Props {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  collapsible?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  hasChanges?: boolean;
  showReset?: boolean;
  resetDisabled?: boolean;
  resetAriaLabel?: string;
  statusIcon?: string;
  statusIconClass?: string;
  headerTinted?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
  collapsible: true,
  interactive: false,
  disabled: false,
  hasChanges: false,
  showReset: false,
  resetDisabled: false,
  resetAriaLabel: undefined,
  statusIcon: undefined,
  statusIconClass: "text-muted-foreground",
  headerTinted: false,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
  "header-click": [];
  reset: [];
}>();

const slots = useSlots();
const { t } = useStudioI18n();

const sectionTitleKeys: Readonly<Record<string, StudioMessageKey>> = {
  Classes: "inspector.section.classes",
  Content: "inspector.section.content",
  Typography: "inspector.section.typography",
  Image: "inspector.section.image",
  Navigation: "inspector.section.navigation",
  "Nav item": "inspector.section.navItem",
  Repeat: "inspector.section.repeat",
  Video: "inspector.section.video",
  Button: "inspector.section.button",
  Link: "inspector.section.link",
  Code: "inspector.section.code",
  SVG: "inspector.section.svg",
  Icon: "inspector.section.icon",
  Component: "inspector.section.component",
  List: "inspector.section.list",
  "Icon List": "inspector.section.iconList",
  Display: "inspector.section.display",
  Size: "inspector.section.size",
  Spacing: "inspector.section.spacing",
  Position: "inspector.section.position",
  Transform: "inspector.section.transform",
  Background: "inspector.section.background",
  Border: "inspector.section.border",
  Corner: "inspector.section.corner",
  Shadow: "inspector.section.shadow",
  Filter: "inspector.section.filter",
  Opacity: "inspector.section.opacity",
  Attributes: "inspector.section.attributes",
  Visibility: "inspector.section.visibility",
  "Aria Motion": "inspector.section.motion",
};

const localizedTitle = computed(() => {
  const key = sectionTitleKeys[props.title];
  return key ? t(key) : props.title;
});

const internalOpen = ref(props.defaultOpen);
const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (val) => {
    internalOpen.value = val;
    emit("update:open", val);
  },
});

const hasDefaultSlot = computed(() => Boolean(slots.default));

const resetButtonAriaLabel = computed(
  () => props.resetAriaLabel ?? t("inspector.reset", { property: localizedTitle.value }),
);

const headerClass = computed(() => [
  "property-header h-10 px-2 py-2 flex w-full items-center justify-between text-xs font-medium duration-150 transition-colors group border-t border-b -m-px border-dashed border-border",
  props.collapsible
    ? isOpen.value
      ? "bg-card/50 text-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-card/60"
    : props.disabled
      ? "text-muted-foreground opacity-60 cursor-not-allowed bg-card/30"
      : props.interactive
        ? "text-muted-foreground hover:bg-card/60 hover:text-foreground"
        : "bg-card/35 text-foreground",
]);

function handleHeaderClick(): void {
  if (props.disabled) {
    return;
  }

  emit("header-click");
}
</script>

<template>
  <Collapsible v-if="collapsible" v-model:open="isOpen">
    <CollapsibleTrigger
      :class="headerClass"
      :data-highlighted="headerTinted ? 'true' : undefined"
    >
      <div class="flex items-center gap-2 font-serif">
        <slot name="header-title">
          <span>{{ localizedTitle }}</span>
        </slot>
        <slot name="header-content" />
      </div>
      <div class="flex items-center gap-1">
        <slot name="header-actions" />
        <div
          v-if="hasChanges"
          data-testid="property-change-indicator"
          aria-hidden="true"
          class="relative flex h-[9px] w-[9px] items-center justify-center shrink-0"
        >
          <span class="absolute inset-0 rounded-full bg-primary/45 live-ping" />
          <span class="relative h-[7px] w-[7px] rounded-full bg-primary" />
        </div>
        <button
          v-if="showReset"
          type="button"
          data-testid="property-reset-button"
          class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-foreground-10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          :disabled="resetDisabled"
          :aria-label="resetButtonAriaLabel"
          :title="resetButtonAriaLabel"
          @click.stop.prevent="emit('reset')"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.close, 'size-3.5 shrink-0']"
          />
        </button>
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent class="property-content overflow-hidden bg-muted/50">
      <div
        class="property-content-inner px-3 py-4"
        :data-state="isOpen ? 'open' : 'closed'"
      >
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>

  <div v-else>
    <button
      v-if="interactive"
      type="button"
      :disabled="disabled"
      :class="headerClass"
      :data-highlighted="headerTinted ? 'true' : undefined"
      @click="handleHeaderClick"
    >
      <div class="flex items-center gap-2 font-serif">
        <slot name="header-title">
          <span>{{ localizedTitle }}</span>
        </slot>
        <slot name="header-content" />
      </div>
      <div class="flex items-center gap-1.5">
        <slot name="header-actions" />
        <div
          v-if="hasChanges"
          data-testid="property-change-indicator"
          aria-hidden="true"
          class="relative flex h-2 w-2 items-center justify-center shrink-0"
        >
          <span class="absolute inset-0 rounded-full bg-primary/45 live-ping" />
          <span class="relative h-1.5 w-1.5 rounded-full bg-primary" />
        </div>
        <button
          v-if="showReset"
          type="button"
          data-testid="property-reset-button"
          class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-foreground-10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          :disabled="resetDisabled"
          :aria-label="resetButtonAriaLabel"
          :title="resetButtonAriaLabel"
          @click.stop.prevent="emit('reset')"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.close, 'size-3.5 shrink-0']"
          />
        </button>
        <span
          v-if="statusIcon"
          aria-hidden="true"
          :class="[
            statusIcon,
            statusIconClass,
            'size-4 shrink-0 transition-colors',
          ]"
        />
      </div>
    </button>

    <div
      v-else
      :class="headerClass"
      :data-highlighted="headerTinted ? 'true' : undefined"
    >
      <div class="flex items-center gap-2 font-serif">
        <slot name="header-title">
          <span>{{ localizedTitle }}</span>
        </slot>
        <slot name="header-content" />
      </div>
      <div class="flex items-center gap-1.5">
        <slot name="header-actions" />
        <div
          v-if="hasChanges"
          data-testid="property-change-indicator"
          aria-hidden="true"
          class="relative flex h-2 w-2 items-center justify-center shrink-0"
        >
          <span class="absolute inset-0 rounded-full bg-primary/45 live-ping" />
          <span class="relative h-1.5 w-1.5 rounded-full bg-primary" />
        </div>
        <button
          v-if="showReset"
          type="button"
          data-testid="property-reset-button"
          class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-foreground-10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          :disabled="resetDisabled"
          :aria-label="resetButtonAriaLabel"
          :title="resetButtonAriaLabel"
          @click.stop.prevent="emit('reset')"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.close, 'size-3.5 shrink-0']"
          />
        </button>
        <span
          v-if="statusIcon"
          aria-hidden="true"
          :class="[
            statusIcon,
            statusIconClass,
            'size-4 shrink-0 transition-colors',
          ]"
        />
      </div>
    </div>

    <div v-if="hasDefaultSlot" class="px-2 py-2">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.property-header[data-highlighted="true"],
.property-header[data-highlighted="true"]:hover {
  border-color: color-mix(in srgb, var(--primary) 18%, var(--border));
  background: color-mix(in srgb, var(--primary) 5%, var(--card) 95%);
  color: var(--foreground);
}

.property-content {
  overflow: hidden;
  will-change: height;
}

.property-content[data-state="open"] {
  animation: property-content-expand 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.property-content[data-state="closed"] {
  animation: property-content-collapse 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.property-content-inner {
  will-change: opacity, transform;
}

.property-content-inner[data-state="open"] {
  animation: property-inner-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.property-content-inner[data-state="closed"] {
  animation: property-inner-out 90ms cubic-bezier(0.4, 0, 1, 1);
}

@keyframes property-content-expand {
  from {
    height: 0;
  }

  to {
    height: var(--reka-collapsible-content-height);
  }
}

@keyframes property-content-collapse {
  from {
    height: var(--reka-collapsible-content-height);
  }

  to {
    height: 0;
  }
}

@keyframes property-inner-in {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes property-inner-out {
  to {
    opacity: 0;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .property-content[data-state="open"],
  .property-content[data-state="closed"],
  .property-content-inner[data-state="open"],
  .property-content-inner[data-state="closed"] {
    animation-duration: 1ms;
  }
}
</style>
