import { computed, type ComputedRef, type Ref } from "vue";

import { getBreakpointIconClass } from "../../../composables/breakpointIcons";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import {
  compareBreakpointsLargestFirst,
  getDownstreamBreakpointNames,
} from "../../../../lib/styles/responsiveBreakpoints";
import type { InspectorResponsiveStyleMap } from "./useInspectorStyleTarget";

type ItemType = "page" | "layout" | "component";

type OverrideStyleTarget = {
  getResponsiveStyleMap: (
    propertyName: string,
  ) => InspectorResponsiveStyleMap;
  clearStyleProperties: (
    propertyNames: readonly string[],
    itemType?: ItemType,
    itemSlug?: string,
  ) => Promise<boolean>;
};

export interface InspectorOverrideBreakpoint {
  id: string;
  label: string;
  iconClass: string;
  isCurrent: boolean;
}

interface UseInspectorPropertyOverridesOptions<PropertyName extends string> {
  propertyKeys: readonly PropertyName[];
  currentBreakpoint: Ref<string> | ComputedRef<string>;
  styleTarget: OverrideStyleTarget;
}

interface UseInspectorPropertyOverridesReturn<PropertyName extends string> {
  readonly overrideBreakpointIds: ComputedRef<string[]>;
  readonly overrideBreakpoints: ComputedRef<InspectorOverrideBreakpoint[]>;
  readonly currentBreakpointOverrideKeys: ComputedRef<PropertyName[]>;
  readonly hasCurrentBreakpointOverride: ComputedRef<boolean>;
  readonly currentBreakpointLabel: ComputedRef<string>;
  getBreakpointLabel: (breakpointId: string) => string;
  clearCurrentBreakpointOverrides: (
    itemType?: ItemType,
    itemSlug?: string,
  ) => Promise<boolean>;
}

function parseBreakpointWidth(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function useInspectorPropertyOverrides<PropertyName extends string>(
  options: UseInspectorPropertyOverridesOptions<PropertyName>,
): UseInspectorPropertyOverridesReturn<PropertyName> {
  const { propertyKeys, currentBreakpoint, styleTarget } = options;
  const canonicalBreakpoints = useCanonicalBreakpoints({ autoLoad: true });

  const orderedBreakpointIds = computed(() => {
    const enabledBreakpoints = canonicalBreakpoints.enabledBreakpoints?.value;
    if (enabledBreakpoints && enabledBreakpoints.length > 0) {
      return enabledBreakpoints.map((breakpoint) => breakpoint.id);
    }

    return canonicalBreakpoints.activeBreakpoints.value.map(
      (breakpoint) => breakpoint.name,
    );
  });

  const breakpointWidthMeta = computed(() => {
    const enabledBreakpoints = canonicalBreakpoints.enabledBreakpoints?.value;
    if (enabledBreakpoints && enabledBreakpoints.length > 0) {
      return new Map(
        enabledBreakpoints.map((breakpoint) => [
          breakpoint.id,
          {
            minWidth: breakpoint.minWidth,
            canvasWidth: breakpoint.canvasWidth ?? null,
            order: breakpoint.order,
          },
        ]),
      );
    }

    return new Map(
      canonicalBreakpoints.activeBreakpoints.value.map((breakpoint) => [
        breakpoint.name,
        {
          minWidth: parseBreakpointWidth(breakpoint.minWidth) ?? 0,
          canvasWidth: null,
          order: 0,
        },
      ]),
    );
  });

  const breakpointMeta = computed(() => {
    const enabledBreakpoints = canonicalBreakpoints.enabledBreakpoints?.value;
    if (enabledBreakpoints && enabledBreakpoints.length > 0) {
      return new Map(
        enabledBreakpoints.map((breakpoint) => [
          breakpoint.id,
          {
            label: breakpoint.label ?? breakpoint.id,
            iconClass: getBreakpointIconClass({
              id: breakpoint.id,
              icon: breakpoint.icon,
              width: breakpoint.canvasWidth ?? breakpoint.minWidth,
            }),
          },
        ]),
      );
    }

    return new Map(
      canonicalBreakpoints.activeBreakpoints.value.map((breakpoint) => [
        breakpoint.name,
        {
          label: breakpoint.label ?? breakpoint.name,
          iconClass: getBreakpointIconClass({
            id: breakpoint.name,
            width: parseBreakpointWidth(breakpoint.minWidth),
          }),
        },
      ]),
    );
  });

  function getBreakpointLabel(breakpointId: string): string {
    return breakpointMeta.value.get(breakpointId)?.label ?? breakpointId;
  }

  const resetBreakpointIds = computed<string[]>(() => [
    currentBreakpoint.value,
    ...getDownstreamBreakpointNames(
      canonicalBreakpoints.activeBreakpoints.value,
      currentBreakpoint.value,
    ),
  ]);

  const currentBreakpointOverrideKeys = computed<PropertyName[]>(() =>
    propertyKeys.filter((propertyName) => {
      const responsiveMap = styleTarget.getResponsiveStyleMap(propertyName);

      return resetBreakpointIds.value.some(
        (breakpointId) => responsiveMap[breakpointId] !== undefined,
      );
    }),
  );

  const overrideBreakpointIds = computed<string[]>(() => {
    const seen = new Set<string>();

    for (const propertyName of propertyKeys) {
      const responsiveMap = styleTarget.getResponsiveStyleMap(propertyName);

      for (const [breakpointId, propertyValue] of Object.entries(
        responsiveMap,
      )) {
        if (propertyValue !== undefined) {
          seen.add(breakpointId);
        }
      }
    }

    const ordered = orderedBreakpointIds.value.filter((breakpointId) =>
      seen.has(breakpointId),
    );

    const extras = Array.from(seen)
      .filter((breakpointId) => !ordered.includes(breakpointId))
      .sort((left, right) => {
        const leftMeta = breakpointWidthMeta.value.get(left);
        const rightMeta = breakpointWidthMeta.value.get(right);
        return compareBreakpointsLargestFirst(
          {
            name: left,
            minWidth: leftMeta?.minWidth ?? 0,
            canvasWidth: leftMeta?.canvasWidth ?? null,
            order: leftMeta?.order ?? ordered.length,
          },
          {
            name: right,
            minWidth: rightMeta?.minWidth ?? 0,
            canvasWidth: rightMeta?.canvasWidth ?? null,
            order: rightMeta?.order ?? ordered.length,
          },
        );
      });

    return [...ordered, ...extras];
  });

  const overrideBreakpoints = computed<InspectorOverrideBreakpoint[]>(() =>
    overrideBreakpointIds.value.map((breakpointId) => {
      const meta = breakpointMeta.value.get(breakpointId);

      return {
        id: breakpointId,
        label: meta?.label ?? breakpointId,
        iconClass: meta?.iconClass ?? getBreakpointIconClass({ width: null }),
        isCurrent: breakpointId === currentBreakpoint.value,
      } satisfies InspectorOverrideBreakpoint;
    }),
  );

  const hasCurrentBreakpointOverride = computed(
    () => currentBreakpointOverrideKeys.value.length > 0,
  );

  const currentBreakpointLabel = computed(() =>
    getBreakpointLabel(currentBreakpoint.value),
  );

  async function clearCurrentBreakpointOverrides(
    itemType?: ItemType,
    itemSlug?: string,
  ): Promise<boolean> {
    if (currentBreakpointOverrideKeys.value.length === 0) {
      return true;
    }

    return styleTarget.clearStyleProperties(
      currentBreakpointOverrideKeys.value,
      itemType,
      itemSlug,
    );
  }

  return {
    overrideBreakpointIds,
    overrideBreakpoints,
    currentBreakpointOverrideKeys,
    hasCurrentBreakpointOverride,
    currentBreakpointLabel,
    getBreakpointLabel,
    clearCurrentBreakpointOverrides,
  };
}
