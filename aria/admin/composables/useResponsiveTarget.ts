import { computed } from "vue";

import { useViewport } from "./useViewport";

const DEFAULT_TARGET = "base";

function normalizeResponsiveTarget(value: string | null): string {
  if (!value) {
    return DEFAULT_TARGET;
  }

  const normalized = value.trim();

  switch (normalized) {
    case "default":
    case "desktop":
      return "base";
    default:
      return normalized || DEFAULT_TARGET;
  }
}

export function useResponsiveTarget() {
  const { viewport, setViewport } = useViewport();

  const targetBreakpoint = computed(() =>
    normalizeResponsiveTarget(viewport.value),
  );

  const isBaseTarget = computed(
    () => targetBreakpoint.value === DEFAULT_TARGET,
  );
  const hasOverrideTarget = computed(() => !isBaseTarget.value);

  function setTargetBreakpoint(nextTarget: string): void {
    setViewport(normalizeResponsiveTarget(nextTarget));
  }

  function clearTargetBreakpoint(): void {
    setViewport(DEFAULT_TARGET);
  }

  function toggleTargetBreakpoint(nextTarget: string): void {
    const normalizedTarget = normalizeResponsiveTarget(nextTarget);
    setViewport(
      targetBreakpoint.value === normalizedTarget
        ? DEFAULT_TARGET
        : normalizedTarget,
    );
  }

  return {
    targetBreakpoint,
    isBaseTarget,
    hasOverrideTarget,
    setTargetBreakpoint,
    clearTargetBreakpoint,
    toggleTargetBreakpoint,
  };
}
