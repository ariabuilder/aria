/**
 * Loads pages, layouts, and components via Astro actions (server-side expansion).
 */

import { ref, readonly, type Ref, type DeepReadonly } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { log } from "@/lib/utils/logger";
import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
  BuilderNode,
} from "../../lib/types/nodes";
import type { ItemType } from "../types/app";
import {
  validateComponentDSL,
  validateLayoutDSL,
  validatePageDSL,
} from "../../lib/schemas/nodes";
import {
  unwrapItemLoadingComposeResult,
  type ItemLoadingComposeResult,
} from "./itemLoadingActionResults";
import { useAppRouter } from "@/features/Core/composables/useAppRouter";
import { editorSlugsMatch, normalizeEditorSlug } from "@/lib/editor/slugs";
import { snapshotLayoutSlots, stripOrphanPageSlotRoots } from "../../lib/layouts/slotEditing";
import {
  clearInsertionContextSingleton,
} from "./useInsertionContext";
import {
  composeCacheKey,
  deleteInFlightComposeRequest,
  getCachedCompose,
  getInFlightComposeRequest,
  invalidateComposeCache,
  setCachedCompose,
  setInFlightComposeRequest,
} from "./composeClientCache";

interface ItemLoadingState {
  readonly isLoading: Ref<boolean>;
  readonly loadError: Ref<string | null>;
}

/**
 * Application state interface (injected dependency)
 */
interface AppState {
  readonly pageBlocks: Ref<BuilderNode[]>;
  readonly composeNonce: Ref<string | null>;
  readonly currentPage: Ref<PageDSL | null>;
  readonly currentLayout: Ref<LayoutDSL | null>;
  readonly currentComponent: Ref<ComponentDSL | null>;
  readonly currentItemType: Ref<ItemType>;
  readonly selectedLayoutRegion: Ref<string | null>;
  readonly hasUnsavedChanges: Ref<boolean>;
  readonly lastSavedSnapshot: Ref<string>;
  readonly layoutSlotsSnapshot: Ref<string>;
  readonly loadingState: Ref<{ isLoading: boolean; loadError: string | null }>;
}

interface LoadPageResult {
  readonly pageBlocks: BuilderNode[];
  readonly pageData: PageDSL;
  readonly layoutData: LayoutDSL | null;
  readonly nonce: string;
}

interface PerformanceMetrics {
  readonly composeTime: number;
  readonly totalTime: number;
}

/**
 * Composable return type
 */
interface UseItemLoadingReturn {
  readonly loadPage: (slug: string) => Promise<LoadPageResult | null>;
  readonly loadLayout: (slug: string) => Promise<void>;
  readonly loadLayoutDataOnly: (slug: string) => Promise<LayoutDSL | null>;
  readonly loadComponent: (slug: string) => Promise<void>;
  readonly prefetchPageData: (slug: string) => Promise<void>;
  /** Surface a load failure to UI state (e.g. auto-load on edit) */
  readonly reportLoadFailure: (message: string) => void;
  /** Loading state flag */
  readonly isLoading: DeepReadonly<Ref<boolean>>;
  readonly loadError: DeepReadonly<Ref<string | null>>;
}

const DEFAULT_LAYOUT_SLOT = {
  name: "default",
  label: "Default",
  required: true,
} as const;

const DEFAULT_STATUS = "draft" as const;

const TEMP_PAGE_PREFIX = "temp-page-" as const;

const TEMP_SLUG_PREFIX = "temp-" as const;

const LOG_PREFIX = "[useItemLoading]" as const;

let pageLoadGeneration = 0;
let layoutLoadGeneration = 0;
let componentLoadGeneration = 0;

/** @internal Test-only reset for load generation counters. */
export function __resetItemLoadingGenerationsForTests(): void {
  pageLoadGeneration = 0;
  layoutLoadGeneration = 0;
  componentLoadGeneration = 0;
}

export { clearComposeCache, invalidateComposeCache } from "./composeClientCache";

type ComposeRequestSource = "loadPage" | "loadComponent" | "prefetchPageData";

async function requestComposeResult(
  itemType: "page" | "component",
  slug: string,
  source: ComposeRequestSource,
): Promise<ItemLoadingComposeResult> {
  const cached = getCachedCompose(itemType, slug);
  if (cached) {
    return cached;
  }

  const key = composeCacheKey(itemType, slug);
  const inFlightRequest = getInFlightComposeRequest(key);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const result = await actions.compose({
      pageSlug: slug,
      itemType,
    });

    const parsedCompose = unwrapItemLoadingComposeResult(
      result,
      "Invalid compose data returned",
      {
        itemType,
        slug,
        source,
      },
    );

    if (!parsedCompose.success) {
      throw new Error(parsedCompose.error);
    }

    setCachedCompose(itemType, slug, parsedCompose.data);
    return parsedCompose.data;
  })().finally(() => {
    deleteInFlightComposeRequest(key);
  });

  setInFlightComposeRequest(key, request);
  return await request;
}

/**
 * Validate slug
 */
function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length > 0;
}

function isErrorInstance(error: unknown): error is Error {
  return error instanceof Error;
}

function normalizeSlug(slug: string): string {
  return normalizeEditorSlug(slug);
}

function shouldApplyLoadResult(
  generation: number,
  latestGeneration: number,
  itemType: ItemType,
  normalizedSlug: string,
): boolean {
  if (generation !== latestGeneration) {
    logDebug(
      `Skipping stale ${itemType} load (gen ${generation} vs ${latestGeneration})`,
    );
    return false;
  }

  const appRouter = useAppRouter();
  const mode = appRouter.editingMode.value;
  if (
    !mode.isEditing ||
    mode.itemType !== itemType ||
    !mode.itemSlug ||
    !editorSlugsMatch(mode.itemSlug, normalizedSlug)
  ) {
    logDebug(
      `Skipping ${itemType} load for ${normalizedSlug}; editing target is ${mode.itemType}:${mode.itemSlug}`,
    );
    return false;
  }

  return true;
}

function extractErrorMessage(
  error: unknown,
  fallback: string = "Unknown error",
): string {
  if (isErrorInstance(error)) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function logError(context: string, error: unknown): void {
  log("error", `${LOG_PREFIX} Error ${context}`, { error });
}

function logDebug(message: string, ...args: unknown[]): void {
  log("debug", `${LOG_PREFIX} ${message}`, { args });
}

function logInfo(message: string): void {
  log("info", `${LOG_PREFIX} ${message}`);
}

function logPerformance(label: string, duration: number): void {
  log("debug", `${LOG_PREFIX} ${label}`, { durationMs: duration });
}

function createPerformanceTracker(): {
  mark: (label: string) => void;
  measure: (label: string) => number;
} {
  const marks = new Map<string, number>();
  const startTime = performance.now();

  return {
    mark: (label: string) => {
      marks.set(label, performance.now());
    },
    measure: (label: string) => {
      const marked = marks.get(label);
      if (marked) {
        return performance.now() - marked;
      }
      return performance.now() - startTime;
    },
  };
}

function createLayoutFromDSL(data: LayoutDSL, fallbackSlug: string): LayoutDSL {
  return {
    id: data.id || fallbackSlug,
    name: data.name || fallbackSlug,
    description: data.description,
    nodes: data.nodes || [],
    slots: data.slots || [DEFAULT_LAYOUT_SLOT],
    metadata: data.metadata || { regions: {} },
    settings: data.settings,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

function toMutableNodes(nodes: readonly BuilderNode[]): BuilderNode[] {
  return [...nodes];
}

function toTypedCssVariables(
  cssVariables: unknown,
): Record<string, string> | undefined {
  const parsed = z.record(z.string(), z.string()).safeParse(cssVariables);
  return parsed.success ? parsed.data : undefined;
}

function toPageStatus(status: unknown): "draft" | "published" | "archived" {
  if (status === "published") return "published";
  if (status === "archived") return "archived";
  return "draft";
}

function buildLayoutFromCompose(
  composed: ItemLoadingComposeResult,
): LayoutDSL | null {
  if (!composed.currentLayout) return null;

  const layout = composed.currentLayout;
  const slots = layout.slots
    ? layout.slots.map((slot) => ({
        ...slot,
        defaultContent: slot.defaultContent
          ? toMutableNodes(slot.defaultContent)
          : undefined,
      }))
    : [];

  const candidateLayout: LayoutDSL = {
    id: layout.id,
    name: layout.title || layout.slug || layout.id,
    description: layout.title || layout.slug,
    nodes: [],
    slots,
    metadata: { regions: layout.regions || {} },
  };

  const parsedLayout = validateLayoutDSL(candidateLayout);
  if (!parsedLayout.success) {
    log("warn", "[useItemLoading] Invalid layout DSL derived from compose", {
      layoutId: layout.id,
      issues: parsedLayout.error.issues,
    });
    throw new Error("Invalid layout DSL returned from compose action");
  }

  return parsedLayout.data;
}

function buildPageFromCompose(
  composed: ItemLoadingComposeResult,
  normalizedSlug: string,
): PageDSL {
  const candidatePage: PageDSL = {
    id: composed.pageMetadata.id || normalizedSlug,
    title: composed.pageMetadata.title || normalizedSlug,
    slug: composed.pageMetadata.slug || normalizedSlug,
    nodes: toMutableNodes(composed.originalNodes || composed.pageBlocks),
    frontmatter: composed.pageMetadata.frontmatter || {},
    status: toPageStatus(composed.pageMetadata.status ?? DEFAULT_STATUS),
    systemRole: composed.pageMetadata.systemRole,
    accessMode: composed.pageMetadata.accessMode,
    hasPassword: composed.pageMetadata.hasPassword,
    version: composed.pageMetadata.version,
    updatedAt: composed.pageMetadata.updatedAt || new Date().toISOString(),
    settings: {
      cssVariables: toTypedCssVariables(
        composed.pageMetadata.settings?.cssVariables,
      ),
    },
    layout: composed.pageMetadata.layout,
  };

  const parsedPage = validatePageDSL(candidatePage);
  if (!parsedPage.success) {
    log("warn", "[useItemLoading] Invalid page DSL derived from compose", {
      slug: normalizedSlug,
      issues: parsedPage.error.issues,
    });
    throw new Error("Invalid page DSL returned from compose action");
  }

  return parsedPage.data;
}

function buildComponentFromCompose(
  composed: ItemLoadingComposeResult,
  slug: string,
): ComponentDSL {
  const candidateComponent: ComponentDSL = {
    id: composed.pageMetadata.id || slug,
    name: composed.pageMetadata.title || composed.pageMetadata.name || slug,
    description: composed.pageMetadata.title || composed.pageMetadata.name,
    nodes: toMutableNodes(composed.pageBlocks),
    category: composed.pageMetadata.category,
    propSchema: composed.pageMetadata.propSchema,
    slots: composed.pageMetadata.slots,
    version: composed.pageMetadata.version,
    settings: {
      cssVariables: toTypedCssVariables(
        composed.pageMetadata.settings?.cssVariables,
      ),
    },
    updatedAt: composed.pageMetadata.updatedAt || new Date().toISOString(),
  };

  const parsedComponent = validateComponentDSL(candidateComponent);
  if (!parsedComponent.success) {
    log("warn", "[useItemLoading] Invalid component DSL derived from compose", {
      slug,
      issues: parsedComponent.error.issues,
    });
    throw new Error("Invalid component DSL returned from compose action");
  }

  return parsedComponent.data;
}

function createTempPage(
  id: string,
  title: string,
  nodes: BuilderNode[],
): PageDSL {
  return {
    id: `${TEMP_PAGE_PREFIX}${id}`,
    title: title || id,
    slug: `${TEMP_SLUG_PREFIX}${id}`,
    nodes,
    status: DEFAULT_STATUS,
  };
}

function syncPageState(
  appState: AppState,
  composed: ItemLoadingComposeResult,
  pageData: PageDSL,
  layoutData: LayoutDSL | null,
  clearSelectedBlock: () => void,
  createSnapshot: (blocks: BuilderNode[]) => string,
): void {
  appState.composeNonce.value = composed.nonce;
  appState.currentItemType.value = "page";
  appState.currentComponent.value = null;
  appState.currentLayout.value = layoutData;
  appState.currentPage.value = pageData;
  appState.selectedLayoutRegion.value = null;
  clearSelectedBlock();

  const cleanedBlocks =
    layoutData != null
      ? stripOrphanPageSlotRoots(composed.pageBlocks, layoutData)
      : composed.pageBlocks;
  const runtimeBlocks = toMutableNodes(cleanedBlocks);
  appState.pageBlocks.value = runtimeBlocks;

  // Load-time normalization is system work, not a user edit. Establish the
  // baseline from the exact tree Composer exposes after normalization.
  appState.lastSavedSnapshot.value = createSnapshot(runtimeBlocks);
  appState.layoutSlotsSnapshot.value = snapshotLayoutSlots(layoutData);
  appState.hasUnsavedChanges.value = false;
}

function syncLayoutState(
  appState: AppState,
  layout: LayoutDSL,
  slug: string,
  clearSelectedBlock: () => void,
  createSnapshot: (blocks: BuilderNode[]) => string,
): void {
  appState.currentLayout.value = layout;
  appState.currentItemType.value = "layout";
  appState.currentPage.value = createTempPage(slug, layout.name || slug, []);
  appState.currentComponent.value = null;
  clearSelectedBlock();
  appState.selectedLayoutRegion.value = null;
  appState.pageBlocks.value = layout.nodes;
  appState.lastSavedSnapshot.value = createSnapshot(layout.nodes);
  appState.layoutSlotsSnapshot.value = snapshotLayoutSlots(layout);
  appState.hasUnsavedChanges.value = false;
}

function syncComponentState(
  appState: AppState,
  componentData: ComponentDSL,
  composed: ItemLoadingComposeResult,
  slug: string,
  clearSelectedBlock: () => void,
  createSnapshot: (blocks: BuilderNode[]) => string,
): void {
  appState.pageBlocks.value = toMutableNodes(composed.pageBlocks);
  appState.composeNonce.value = composed.nonce;
  appState.lastSavedSnapshot.value = createSnapshot(
    toMutableNodes(composed.pageBlocks),
  );
  appState.hasUnsavedChanges.value = false;
  appState.currentComponent.value = componentData;
  appState.currentItemType.value = "component";
  appState.currentPage.value = createTempPage(
    slug,
    componentData.name || slug,
    toMutableNodes(composed.pageBlocks),
  );
  appState.currentLayout.value = null;
  appState.layoutSlotsSnapshot.value = "[]";
  clearSelectedBlock();
}

/**
 * Load pages/layouts/components via Astro actions (server-side expansion).
 *
 * @param appState - Application state refs
 * @param clearSelectedBlock - Callback to clear block selection
 * @param createSnapshot - Callback to create state snapshot
 *
 * @example
 * ```vue
 * <script setup>
 * import { useItemLoading } from '@/composables/useItemLoading';
 * import { useApp } from '@/composables/useApp';
 *
 * const appState = useApp();
 * const {
 *   loadPage,
 *   loadLayout,
 *   loadComponent,
 *   prefetchPageData,
 *   isLoading,
 *   loadError
 * } = useItemLoading(appState, clearSelectedBlock, createSnapshot);
 *
 * // Load page for editing
 * async function handleLoadPage(slug: string) {
 *   const result = await loadPage(slug);
 *   if (result) {
 *     console.log('Loaded page:', result.pageData.title);
 *   }
 * }
 *
 * // Prefetch on hover
 * function handlePageHover(slug: string) {
 *   prefetchPageData(slug);
 * }
 *
 * // Load layout
 * async function handleLoadLayout(slug: string) {
 *   await loadLayout(slug);
 * }
 * </script>
 * ```
 */
export function useItemLoading(
  appState: AppState,
  clearSelectedBlock: () => void,
  createSnapshot: (blocks: BuilderNode[]) => string,
): UseItemLoadingReturn {

  const isLoading = ref<boolean>(false);
  const loadError = ref<string | null>(null);

  /**
   * Set loading state
   */
  function setLoading(value: boolean): void {
    isLoading.value = value;
    appState.loadingState.value.isLoading = value;
  }

  /**
   * Set error state
   */
  function setError(message: string | null): void {
    loadError.value = message;
    appState.loadingState.value.loadError = message;
  }

  /**
   * Load page with compose action (server-side expansion)
   *
   * Steps:
   * 1. Normalize slug (handle index variations)
   * 2. Call compose action with performance tracking
   * 3. Build page and layout DSL from result
   * 4. Sync state with app state
   * 5. Return complete result
   *
   * @param slug - Page slug to load
   * @returns Load result with blocks, data, and nonce
   */
  function clearPageEditorStateForLoad(): void {
    clearInsertionContextSingleton();
    appState.pageBlocks.value = [];
    appState.currentPage.value = null;
    appState.currentLayout.value = null;
    appState.currentComponent.value = null;
    appState.composeNonce.value = null;
    appState.selectedLayoutRegion.value = null;
    appState.hasUnsavedChanges.value = false;
  }

  function clearLayoutEditorStateForLoad(): void {
    clearInsertionContextSingleton();
    appState.pageBlocks.value = [];
    appState.currentPage.value = null;
    appState.currentLayout.value = null;
    appState.currentComponent.value = null;
    appState.composeNonce.value = null;
    appState.selectedLayoutRegion.value = null;
    appState.hasUnsavedChanges.value = false;
  }

  function clearComponentEditorStateForLoad(): void {
    clearInsertionContextSingleton();
    appState.pageBlocks.value = [];
    appState.currentPage.value = null;
    appState.currentLayout.value = null;
    appState.currentComponent.value = null;
    appState.composeNonce.value = null;
    appState.selectedLayoutRegion.value = null;
    appState.hasUnsavedChanges.value = false;
  }

  async function loadPage(slug: string): Promise<LoadPageResult | null> {
    if (!isValidSlug(slug)) {
      logError("loading page", "Invalid slug");
      return null;
    }

    const normalizedSlug = normalizeSlug(slug);
    pageLoadGeneration += 1;
    const loadGeneration = pageLoadGeneration;

    setLoading(true);
    setError(null);
    clearPageEditorStateForLoad();

    const perf = createPerformanceTracker();

    try {
      const cached = getCachedCompose("page", normalizedSlug);
      if (cached) {
        logDebug(`Cache HIT for page: ${normalizedSlug}`);
      }

      const composed = await requestComposeResult(
        "page",
        normalizedSlug,
        "loadPage",
      );

      // Invalidate cache after consumption so next edit gets fresh data
      invalidateComposeCache("page", normalizedSlug);

      perf.mark("compose");
      logPerformance("compose action", perf.measure("compose"));

      const pageData = buildPageFromCompose(composed, normalizedSlug);
      const layoutData = buildLayoutFromCompose(composed);

      logPerformance("loadPage finished", perf.measure("loadPage"));

      if (
        !shouldApplyLoadResult(
          loadGeneration,
          pageLoadGeneration,
          "page",
          normalizedSlug,
        )
      ) {
        return null;
      }

      syncPageState(
        appState,
        composed,
        pageData,
        layoutData,
        clearSelectedBlock,
        createSnapshot,
      );

      return {
        pageBlocks: toMutableNodes(composed.pageBlocks),
        pageData,
        layoutData,
        nonce: composed.nonce ?? "",
      };
    } catch (error) {
      const errorMsg = extractErrorMessage(error, "Failed to load page");
      if (
        shouldApplyLoadResult(
          loadGeneration,
          pageLoadGeneration,
          "page",
          normalizedSlug,
        )
      ) {
        setError(errorMsg);
      }
      logError("loading page", error);
      return null;
    } finally {
      if (loadGeneration === pageLoadGeneration) {
        setLoading(false);
      }
    }
  }

  /**
   * Load layout for editing
   *
   * Loads layout via getItem action and switches to layout editing mode.
   * Creates temp page for layout context.
   *
   * @param slug - Layout slug to load
   */
  async function loadLayout(slug: string): Promise<void> {
    if (!isValidSlug(slug)) {
      logError("loading layout", "Invalid slug");
      return;
    }

    const normalizedSlug = normalizeSlug(slug);
    layoutLoadGeneration += 1;
    const loadGeneration = layoutLoadGeneration;

    setLoading(true);
    setError(null);
    clearLayoutEditorStateForLoad();

    try {
      const { data: actionData, error: actionError } = await actions.getItem({
        collection: "layouts",
        slug: slug,
      });

      if (actionError) {
        throw new Error(`Failed to load layout: ${actionError.message}`);
      }

      if (!actionData) {
        throw new Error("No layout data returned");
      }

      const parsedLayout = validateLayoutDSL(actionData);
      if (!parsedLayout.success) {
        throw new Error("Invalid layout DSL returned");
      }

      const layout = createLayoutFromDSL(parsedLayout.data, slug);

      if (
        !shouldApplyLoadResult(
          loadGeneration,
          layoutLoadGeneration,
          "layout",
          normalizedSlug,
        )
      ) {
        return;
      }

      syncLayoutState(
        appState,
        layout,
        slug,
        clearSelectedBlock,
        createSnapshot,
      );

      logInfo(`Successfully loaded layout: ${slug}`);
    } catch (error) {
      const errorMsg = extractErrorMessage(error, "Failed to load layout");
      if (
        shouldApplyLoadResult(
          loadGeneration,
          layoutLoadGeneration,
          "layout",
          normalizedSlug,
        )
      ) {
        setError(errorMsg);
      }
      logError("loading layout", error);
    } finally {
      if (loadGeneration === layoutLoadGeneration) {
        setLoading(false);
      }
    }
  }

  /**
   * Load layout data only (for page context)
   *
   * Loads layout without switching views or updating app state.
   * Used when page references a layout.
   *
   * @param slug - Layout slug to load
   * @returns Layout DSL or null
   */
  async function loadLayoutDataOnly(slug: string): Promise<LayoutDSL | null> {
    if (!isValidSlug(slug)) {
      logDebug("loadLayoutDataOnly called with empty/invalid slug");
      return null;
    }

    try {
      const { data: actionData, error: actionError } = await actions.getItem({
        collection: "layouts",
        slug: slug,
      });

      if (actionError) {
        throw new Error(`Failed to load layout: ${actionError.message}`);
      }

      if (!actionData) {
        logDebug("Layout not found:", slug);
        return null;
      }

      const parsedLayout = validateLayoutDSL(actionData);
      if (!parsedLayout.success) {
        logDebug("Invalid layout DSL for:", slug);
        return null;
      }

      return createLayoutFromDSL(parsedLayout.data, slug);
    } catch (error) {
      logError("loading layout data", error);
      return null;
    }
  }

  /**
   * Load component with compose action (server-side expansion)
   *
   * Loads component for editing via compose action.
   * Creates temp page for component context.
   *
   * @param slug - Component slug to load
   */
  async function loadComponent(slug: string): Promise<void> {
    if (!isValidSlug(slug)) {
      logError("loading component", "Invalid slug");
      return;
    }

    const normalizedSlug = normalizeSlug(slug);
    componentLoadGeneration += 1;
    const loadGeneration = componentLoadGeneration;

    setLoading(true);
    setError(null);
    clearComponentEditorStateForLoad();

    try {
      const composed = await requestComposeResult(
        "component",
        normalizedSlug,
        "loadComponent",
      );

      const componentData = buildComponentFromCompose(composed, normalizedSlug);

      if (
        !shouldApplyLoadResult(
          loadGeneration,
          componentLoadGeneration,
          "component",
          normalizedSlug,
        )
      ) {
        return;
      }

      syncComponentState(
        appState,
        componentData,
        composed,
        normalizedSlug,
        clearSelectedBlock,
        createSnapshot,
      );

      logInfo(`Successfully loaded component: ${normalizedSlug}`);
    } catch (error) {
      const errorMsg = extractErrorMessage(error, "Failed to load component");
      if (
        shouldApplyLoadResult(
          loadGeneration,
          componentLoadGeneration,
          "component",
          normalizedSlug,
        )
      ) {
        setError(errorMsg);
      }
      logError("loading component", error);
    } finally {
      if (loadGeneration === componentLoadGeneration) {
        setLoading(false);
      }
    }
  }

  /**
   * Prefetch page data on hover
   *
   * Background load for faster navigation. Does not update UI state.
   * Errors are logged at debug level.
   *
   * @param slug - Page slug to prefetch
   */
  function reportLoadFailure(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Failed to load item");
    } else {
      setError(trimmed);
    }
    setLoading(false);
  }

  /**
   * /** Prefetch concurrency limiter. Prevents flooding the server with
   * simultaneous compose requests when the pages list triggers.
   */
  const PREFETCH_MAX_CONCURRENT = 3;
  const prefetchQueue: Array<() => Promise<void>> = [];
  let prefetchInFlight = 0;

  function drainPrefetchQueue(): void {
    while (
      prefetchInFlight < PREFETCH_MAX_CONCURRENT &&
      prefetchQueue.length > 0
    ) {
      const next = prefetchQueue.shift()!;
      prefetchInFlight++;
      next().finally(() => {
        prefetchInFlight--;
        drainPrefetchQueue();
      });
    }
  }

  function enqueuePrefetch(fn: () => Promise<void>): void {
    prefetchQueue.push(fn);
    drainPrefetchQueue();
  }

  async function prefetchPageData(slug: string): Promise<void> {
    if (!isValidSlug(slug)) {
      return;
    }

    const normalizedSlug = normalizeSlug(slug);

    // Skip if already cached and fresh
    if (getCachedCompose("page", normalizedSlug)) {
      logDebug(`Prefetch skip (cached): ${slug}`);
      return;
    }

    // Enqueue to limit concurrent prefetch requests and avoid
    // overwhelming the Worker's D1 connection pool.
    enqueuePrefetch(async () => {
      try {
        await requestComposeResult("page", normalizedSlug, "prefetchPageData");
        logDebug(`Prefetched page: ${slug}`);
      } catch (error) {
        logDebug(`Prefetch failed for ${slug}:`, error);
      }
    });
  }

  return {
    loadPage,
    loadLayout,
    loadLayoutDataOnly,
    loadComponent,
    prefetchPageData,
    reportLoadFailure,

    // State (readonly to prevent external mutation)
    isLoading: readonly(isLoading) as DeepReadonly<Ref<boolean>>,
    loadError: readonly(loadError) as DeepReadonly<Ref<string | null>>,
  };
}

export type { ItemLoadingState, AppState, LoadPageResult, PerformanceMetrics };
