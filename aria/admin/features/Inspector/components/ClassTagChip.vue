<script setup lang="ts">
import { computed } from "vue";
import { studioIcons } from "@/lib/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LONG_CLASS_THRESHOLD = 40;

type ClassTagVariant = "utility" | "custom" | "legacy";

interface Props {
  label: string;
  variant?: ClassTagVariant;
  active?: boolean;
  expanded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "utility",
  active: false,
  expanded: false,
});

const emit = defineEmits<{
  click: [];
  remove: [];
  "toggle-expand": [];
}>();

const isLongUtility = computed(
  () =>
    props.variant === "utility" && props.label.length > LONG_CLASS_THRESHOLD,
);

const isLongLegacy = computed(
  () => props.variant === "legacy" && props.label.length > LONG_CLASS_THRESHOLD,
);

const expandable = computed(() => isLongUtility.value);

const showTruncate = computed(() => {
  if (props.variant === "custom") return false;
  if (expandable.value && props.expanded) return false;
  return isLongUtility.value || isLongLegacy.value;
});

const showTooltip = computed(() => {
  if (props.variant === "custom") return false;
  if (expandable.value && props.expanded) return false;
  return isLongUtility.value || isLongLegacy.value;
});

const chipClasses = computed(() => {
  if (props.expanded && expandable.value) {
    return cn(
      "items-start gap-1 py-1 h-auto pl-2 pr-2",
      variantClasses.value,
    );
  }

  if (props.variant === "custom") {
    return cn("items-center h-6 px-2", variantClasses.value);
  }

  return cn(
    "items-center gap-1 h-6 pl-2",
    expandable.value ? "pr-1" : "pr-2",
    variantClasses.value,
  );
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case "custom":
      return props.active
        ? "class-tag-chip--custom-active border border-dashed border-primary/70 text-foreground"
        : "class-tag-chip--custom bg-muted text-foreground/90 border border-dashed border-white/10";
    case "legacy":
      return "class-tag-chip--legacy border border-dashed border-amber-500/30 bg-amber-500/10 text-foreground pl-1.5";
    default:
      return "class-tag-chip--utility bg-primary/30 text-sidebar-foreground border border-dashed border-primary/30";
  }
});

const labelClasses = computed(() => {
  if (props.variant === "custom") {
    return "min-w-0 text-left";
  }

  if (props.expanded && expandable.value) {
    return "min-w-0 break-all whitespace-normal font-mono text-left";
  }

  if (showTruncate.value) {
    return "min-w-0 truncate font-mono text-left";
  }

  return "min-w-0 font-mono text-left";
});

function onChipClick() {
  emit("click");
}

function onChipKeydown(event: KeyboardEvent) {
  if (props.variant !== "custom") return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("click");
}
</script>

<template>
  <span
    class="class-tag-chip"
    :class="chipClasses"
    role="button"
    tabindex="0"
    @click="onChipClick"
    @keydown="onChipKeydown"
  >
    <TooltipProvider v-if="showTooltip">
      <Tooltip>
        <TooltipTrigger as-child>
          <span :class="labelClasses">{{ label }}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" class="max-w-sm break-all font-mono text-xs">
          {{ label }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <span v-else :class="labelClasses">{{ label }}</span>

    <span
      v-if="expandable"
      role="button"
      tabindex="0"
      class="class-tag-expand inline-flex shrink-0 items-center justify-center opacity-40 transition-opacity hover:opacity-100"
      :aria-label="expanded ? 'Collapse class' : 'Expand class'"
      @click.stop="emit('toggle-expand')"
      @keydown.enter.prevent="emit('toggle-expand')"
      @keydown.space.prevent="emit('toggle-expand')"
    >
      <span
        :class="[
          expanded ? studioIcons.chevronUp : studioIcons.chevronDown,
          'size-3',
        ]"
      />
    </span>

    <slot name="actions" />

    <span
      class="class-tag-remove"
      role="button"
      tabindex="0"
      aria-label="Remove class"
      @click.stop="emit('remove')"
      @keydown.enter.prevent="emit('remove')"
      @keydown.space.prevent="emit('remove')"
    >
      <span class="class-tag-remove-btn">
        <span
          :class="
            variant === 'legacy'
              ? studioIcons.closeCircleBold
              : studioIcons.close
          "
          class="class-tag-remove-icon"
        />
      </span>
    </span>
  </span>
</template>

<style scoped>
.class-tag-chip {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  border-radius: 0.125rem;
  font-size: 0.75rem;
  line-height: 1rem;
  transition: background-color 150ms ease, color 150ms ease;
}

.class-tag-chip--custom {
  cursor: pointer;
}

.class-tag-chip--custom-active {
  cursor: pointer;
  background-color: color-mix(in srgb, var(--primary) 12%, var(--background));
}

.class-tag-chip--custom-active:hover {
  background-color: color-mix(in srgb, var(--primary) 16%, var(--background));
}

.class-tag-chip--custom:hover {
  background-color: color-mix(in srgb, var(--color-muted) 80%, transparent);
}

.class-tag-chip--legacy:hover {
  background-color: color-mix(in srgb, rgb(245 158 11) 15%, transparent);
}

.class-tag-expand:hover {
  opacity: 1;
}

.class-tag-remove {
  position: absolute;
  top: 50%;
  right: 1px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  padding-left: 0.625rem;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(4px);
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.class-tag-chip:hover > .class-tag-remove,
.class-tag-chip:focus-within > .class-tag-remove,
.class-tag-remove:focus-visible {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  pointer-events: auto;
}

.class-tag-chip--custom > .class-tag-remove,
.class-tag-chip--custom-active > .class-tag-remove {
  position: static;
  width: 0;
  margin-left: 0;
  padding-left: 0;
  overflow: hidden;
  transform: none;
  transition:
    width 130ms cubic-bezier(0.16, 1, 0.3, 1),
    margin-left 130ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 120ms ease;
}

.class-tag-chip--custom:hover > .class-tag-remove,
.class-tag-chip--custom:focus-within > .class-tag-remove,
.class-tag-chip--custom-active:hover > .class-tag-remove,
.class-tag-chip--custom-active:focus-within > .class-tag-remove,
.class-tag-chip--custom .class-tag-remove:focus-visible,
.class-tag-chip--custom-active .class-tag-remove:focus-visible {
  width: 1rem;
  margin-left: 0.25rem;
  transform: none;
}

.class-tag-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 1px dashed color-mix(in srgb, var(--border) 55%, transparent);
  background-color: var(--background);
  color: var(--muted-foreground);
  transition:
    background-color 100ms ease,
    border-color 100ms ease,
    color 100ms ease,
    box-shadow 100ms ease;
  cursor: pointer;
}

.class-tag-remove-icon {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  flex-shrink: 0;
  color: inherit;
}

.class-tag-remove:hover .class-tag-remove-btn,
.class-tag-remove:focus-visible .class-tag-remove-btn {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--destructive) 50%, transparent);
  background-color: color-mix(in srgb, var(--destructive) 5%, var(--background));
  color: var(--destructive);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.24);
}

.class-tag-remove-btn:active {
  border-style: solid;
  border-color: var(--border);
  background-color: var(--sidebar);
  color: var(--foreground);
}

@media (hover: none) {
  .class-tag-chip {
    padding-right: 0.25rem;
  }

  .class-tag-remove {
    position: static;
    margin-left: 0.125rem;
    padding-left: 0;
    opacity: 1;
    transform: none;
    pointer-events: auto;
    background: none;
  }
}
</style>
