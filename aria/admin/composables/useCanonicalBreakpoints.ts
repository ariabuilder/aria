import { computed, readonly, ref, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";

import {
  UniversalBreakpointItemSchema,
  createBreakpointDefinitionsFromUniversalBreakpoints,
  createDefaultUniversalBreakpointItems,
  createUnoBreakpointsFromUniversalBreakpoints,
  normalizeUniversalBreakpointItems,
  type UniversalBreakpointItem,
} from "../../lib/styles/universalDesignSystem";
import { resolveBreakpointIconToken } from "./breakpointIcons";
import type { BreakpointDefinition } from "../../lib/types/nodes";
import { compareBreakpointsLargestFirst } from "../../lib/styles/responsiveBreakpoints";

const BreakpointsPayloadSchema = z
  .object({
    breakpoints: z.array(UniversalBreakpointItemSchema),
  })
  .strict();

const DesignSystemActionErrorSchema = z
  .looseObject({
    code: z.string().optional(),
    message: z.string().min(1),
  });

const StyleRefreshStatusSchema = z
  .looseObject({
    success: z.boolean(),
    framework: z.enum(["unocss", "custom"]),
    error: z.string().optional(),
    styleRevision: z.string().optional(),
    invalidatedPageCount: z.int().nonnegative().optional(),
    globalCSSHash: z.string().optional(),
    cssSize: z.number().nonnegative().optional(),
    classCount: z.int().nonnegative().optional(),
    lastCompiled: z.string().optional(),
  });

const GetBreakpointsResultSchema = z
  .looseObject({
    success: z.boolean(),
    data: BreakpointsPayloadSchema.optional(),
    error: DesignSystemActionErrorSchema.optional(),
  });

const SaveBreakpointsResultSchema = z
  .looseObject({
    success: z.boolean(),
    data: BreakpointsPayloadSchema.extend({
      styleRefresh: StyleRefreshStatusSchema.optional(),
    }).optional(),
    error: DesignSystemActionErrorSchema.optional(),
  });

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

type CanonicalBreakpointItem = UniversalBreakpointItem;

export interface BreakpointViewportOption {
  id: string;
  label: string;
  icon: string;
  width: number | null;
  minWidth: number;
  enabled: boolean;
  isDefault: boolean;
  order: number;
}

interface CanonicalBreakpointsOptions {
  autoLoad?: boolean;
}

const breakpointState = ref<CanonicalBreakpointItem[]>(
  createDefaultUniversalBreakpointItems(),
);
const isLoading = ref(false);
const error = ref<Error | null>(null);
let hasLoaded = false;

function normalizeBreakpointState(
  breakpoints: readonly CanonicalBreakpointItem[] | null | undefined,
): CanonicalBreakpointItem[] {
  return normalizeUniversalBreakpointItems(breakpoints);
}

function parseGetBreakpointsResult(
  result: ActionTransportResult,
): CanonicalBreakpointItem[] {
  if (result.error) {
    throw new Error(
      result.error.message ?? "Failed to load canonical breakpoints",
    );
  }

  const parsed = GetBreakpointsResultSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error(
      "Invalid response structure from designSystem.getBreakpoints",
    );
  }

  if (!parsed.data.success || !parsed.data.data) {
    throw new Error(
      parsed.data.error?.message ?? "Failed to load canonical breakpoints",
    );
  }

  return normalizeBreakpointState(parsed.data.data.breakpoints);
}

function parseSaveBreakpointsResult(result: ActionTransportResult): {
  breakpoints: CanonicalBreakpointItem[];
} {
  if (result.error) {
    throw new Error(
      result.error.message ?? "Failed to save canonical breakpoints",
    );
  }

  const parsed = SaveBreakpointsResultSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error(
      "Invalid response structure from designSystem.saveBreakpoints",
    );
  }

  if (!parsed.data.success || !parsed.data.data) {
    throw new Error(
      parsed.data.error?.message ?? "Failed to save canonical breakpoints",
    );
  }

  return {
    breakpoints: normalizeBreakpointState(parsed.data.data.breakpoints),
  };
}

export function useCanonicalBreakpoints(
  options: CanonicalBreakpointsOptions = {},
): {
  breakpoints: Ref<readonly CanonicalBreakpointItem[]>;
  enabledBreakpoints: ComputedRef<CanonicalBreakpointItem[]>;
  activeBreakpoints: ComputedRef<BreakpointDefinition[]>;
  activeViewports: ComputedRef<BreakpointViewportOption[]>;
  unoBreakpoints: ComputedRef<Record<string, string>>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  loadBreakpoints: () => Promise<void>;
  saveBreakpoints: (
    breakpoints: readonly CanonicalBreakpointItem[],
  ) => Promise<void>;
  getBreakpoint: (id: string) => CanonicalBreakpointItem | undefined;
  addBreakpoint: (breakpoint: CanonicalBreakpointItem) => Promise<void>;
  updateBreakpoint: (
    id: string,
    updates: Partial<CanonicalBreakpointItem>,
  ) => Promise<void>;
  toggleBreakpoint: (id: string) => Promise<void>;
  removeBreakpoint: (id: string) => Promise<void>;
  reorderBreakpoints: (orderedIds: string[]) => Promise<void>;
  getViewportForBreakpoint: (breakpointId: string) => string | null;
} {
  const { autoLoad = false } = options;

  const breakpoints = computed(() =>
    normalizeBreakpointState(breakpointState.value),
  );

  const enabledBreakpoints = computed(() =>
    breakpoints.value
      .filter((breakpoint) => breakpoint.id === "base" || breakpoint.enabled)
      .sort((left, right) =>
        compareBreakpointsLargestFirst(
          {
            name: left.id,
            minWidth: left.minWidth,
            canvasWidth: left.canvasWidth,
            order: left.order,
          },
          {
            name: right.id,
            minWidth: right.minWidth,
            canvasWidth: right.canvasWidth,
            order: right.order,
          },
        ),
      ),
  );

  const activeBreakpoints = computed(() =>
    createBreakpointDefinitionsFromUniversalBreakpoints(breakpoints.value),
  );

  const activeViewports = computed<BreakpointViewportOption[]>(() =>
    enabledBreakpoints.value.map((breakpoint) => ({
      id: breakpoint.id,
      label: breakpoint.label,
      icon: resolveBreakpointIconToken({
        id: breakpoint.id,
        icon: breakpoint.icon,
        width: breakpoint.canvasWidth ?? breakpoint.minWidth,
      }),
      width: breakpoint.canvasWidth,
      minWidth: breakpoint.minWidth,
      enabled: breakpoint.enabled,
      isDefault: breakpoint.isDefault,
      order: breakpoint.order,
    })),
  );

  const unoBreakpoints = computed(() =>
    createUnoBreakpointsFromUniversalBreakpoints(breakpoints.value),
  );

  async function loadBreakpoints(): Promise<void> {
    if (isLoading.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await actions.designSystem.getBreakpoints({});
      breakpointState.value = parseGetBreakpointsResult(result);
      hasLoaded = true;
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause
          : new Error("Failed to load canonical breakpoints");
      throw error.value;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveBreakpoints(
    nextBreakpoints: readonly CanonicalBreakpointItem[],
  ): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      const normalized = normalizeBreakpointState(nextBreakpoints);
      const result = await actions.designSystem.saveBreakpoints({
        breakpoints: normalized,
      });
      breakpointState.value = parseSaveBreakpointsResult(result).breakpoints;
      hasLoaded = true;
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause
          : new Error("Failed to save canonical breakpoints");
      throw error.value;
    } finally {
      isLoading.value = false;
    }
  }

  function getBreakpoint(id: string): CanonicalBreakpointItem | undefined {
    return breakpoints.value.find((breakpoint) => breakpoint.id === id);
  }

  async function addBreakpoint(
    breakpoint: CanonicalBreakpointItem,
  ): Promise<void> {
    if (getBreakpoint(breakpoint.id)) {
      throw new Error(`Breakpoint "${breakpoint.id}" already exists`);
    }

    await saveBreakpoints([...breakpoints.value, breakpoint]);
  }

  async function updateBreakpoint(
    id: string,
    updates: Partial<CanonicalBreakpointItem>,
  ): Promise<void> {
    const existing = getBreakpoint(id);
    if (!existing) {
      throw new Error(`Breakpoint "${id}" not found`);
    }

    const nextBreakpoints = breakpoints.value.map((breakpoint) =>
      breakpoint.id === id
        ? {
            ...existing,
            ...updates,
            id: existing.id,
            isDefault: existing.isDefault,
          }
        : breakpoint,
    );

    await saveBreakpoints(nextBreakpoints);
  }

  async function toggleBreakpoint(id: string): Promise<void> {
    const existing = getBreakpoint(id);
    if (!existing) {
      throw new Error(`Breakpoint "${id}" not found`);
    }

    if (existing.id === "base") {
      throw new Error("Base breakpoint cannot be disabled");
    }

    await updateBreakpoint(id, { enabled: !existing.enabled });
  }

  async function removeBreakpoint(id: string): Promise<void> {
    const existing = getBreakpoint(id);
    if (!existing) {
      throw new Error(`Breakpoint "${id}" not found`);
    }

    if (existing.isDefault || existing.id === "base") {
      throw new Error(
        `Cannot remove default breakpoint "${id}". Disable it instead.`,
      );
    }

    await saveBreakpoints(
      breakpoints.value.filter((breakpoint) => breakpoint.id !== id),
    );
  }

  async function reorderBreakpoints(orderedIds: string[]): Promise<void> {
    const existing = breakpoints.value.filter(
      (breakpoint) => breakpoint.id !== "base",
    );
    const reordered = orderedIds
      .map((id, index) => {
        const breakpoint = existing.find((candidate) => candidate.id === id);
        return breakpoint ? { ...breakpoint, order: index } : null;
      })
      .filter(
        (breakpoint): breakpoint is CanonicalBreakpointItem =>
          breakpoint !== null,
      );

    const missing = existing.filter(
      (breakpoint) => !orderedIds.includes(breakpoint.id),
    );

    await saveBreakpoints([
      ...breakpoints.value.filter((breakpoint) => breakpoint.id === "base"),
      ...reordered,
      ...missing.map((breakpoint, index) => ({
        ...breakpoint,
        order: reordered.length + index,
      })),
    ]);
  }

  function getViewportForBreakpoint(breakpointId: string): string | null {
    if (breakpointId === "base") return "base";

    return enabledBreakpoints.value.some(
      (breakpoint) => breakpoint.id === breakpointId,
    )
      ? breakpointId
      : "base";
  }

  if (autoLoad && !hasLoaded && typeof window !== "undefined") {
    void loadBreakpoints().catch(() => {
      // `loadBreakpoints` stores the typed failure in `error`; prevent an
      // optional background refresh from becoming an unhandled rejection.
    });
  }

  return {
    breakpoints: readonly(breakpoints) as Ref<
      readonly CanonicalBreakpointItem[]
    >,
    enabledBreakpoints,
    activeBreakpoints,
    activeViewports,
    unoBreakpoints,
    isLoading: readonly(isLoading) as Ref<boolean>,
    error: readonly(error) as Ref<Error | null>,
    loadBreakpoints,
    saveBreakpoints,
    getBreakpoint,
    addBreakpoint,
    updateBreakpoint,
    toggleBreakpoint,
    removeBreakpoint,
    reorderBreakpoints,
    getViewportForBreakpoint,
  };
}
