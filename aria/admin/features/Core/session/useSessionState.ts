/**
 * useSessionState.ts
 * Persist session UI state across HMR reloads
 */

import { ref, watch, type Ref, type ComputedRef } from "vue";
import { z } from "zod";
import type { SessionState } from "../../../types/app";
import type {
  BuilderNode,
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../../../lib/types/nodes";
import {
  BuilderNodeSchema,
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "../../../../lib/schemas/nodes";
import { sanitizeBuilderNodeTree } from "../../../../lib/blocks/sanitizeBuilderNodeTree";

const SESSION_STORAGE_KEY = "aria-builder-session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const SessionStateSchema = z
  .object({
    currentPage: PageDSLSchema.optional(),
    currentLayout: LayoutDSLSchema.nullable().optional(),
    currentComponent: ComponentDSLSchema.nullable().optional(),
    currentItemType: z.enum(["page", "layout", "component"]),
    selectedBlockId: z.string().nullable(),
    centerView: z.enum(["builder", "options"]),
    leftSidebarOpen: z.boolean(),
    rightSidebarOpen: z.boolean(),
    currentView: z.string(),
    currentSettingsSection: z.string(),
    timestamp: z.number().nonnegative(),
    expandedBlocks: z.array(BuilderNodeSchema).optional(),
  })
  .strict();

function normalizeLayoutForSession(
  layout: LayoutDSL | null | undefined,
): LayoutDSL | null | undefined {
  if (layout == null) {
    return layout;
  }

  const candidate = layout as Partial<LayoutDSL>;
  const fallbackId =
    candidate.id?.trim() ||
    candidate.slug?.trim() ||
    candidate.name?.trim() ||
    candidate.title?.trim() ||
    "session-layout";
  const fallbackName =
    candidate.name?.trim() ||
    candidate.title?.trim() ||
    candidate.slug?.trim() ||
    fallbackId;

  const normalized = {
    id: fallbackId,
    name: fallbackName,
    slug: candidate.slug,
    title: candidate.title ?? fallbackName,
    description: candidate.description ?? candidate.title,
    order: candidate.order,
    nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
    slots: Array.isArray(candidate.slots) ? candidate.slots : [],
    metadata: candidate.metadata ?? { regions: candidate.regions },
    layoutMetadata: candidate.layoutMetadata ??
      candidate.metadata ?? { regions: candidate.regions },
    regions: candidate.regions,
    settings: candidate.settings ?? {},
    tags: candidate.tags,
    categories: candidate.categories,
    layoutType: candidate.layoutType,
    author: candidate.author,
    contributors: candidate.contributors,
    usage: candidate.usage,
    version: candidate.version,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  return LayoutDSLSchema.parse(
    JSON.parse(JSON.stringify(normalized)) as typeof normalized,
  );
}

function normalizeSessionStateInput(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const candidate = payload as Record<string, unknown>;

  return {
    ...candidate,
    currentLayout: normalizeLayoutForSession(
      (candidate.currentLayout as LayoutDSL | null | undefined) ?? undefined,
    ),
  };
}

export interface SessionStateRefs {
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  selectedBlockId: Ref<string | null>;
  // Now read from appRouter
  leftSidebarOpen: ComputedRef<boolean> | Ref<boolean>;
  rightSidebarOpen: ComputedRef<boolean> | Ref<boolean>;
  studioSection: ComputedRef<string> | Ref<string>;
  pageBlocks: Ref<BuilderNode[]>;
}

export function useSessionState(refs: SessionStateRefs) {
  const sessionRestored = ref(false);

  function clearState(): boolean {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return true;
    } catch (error) {
      console.warn("[SessionState] Failed to clear state:", error);
      return false;
    }
  }

  const readStoredState = (): SessionState | null => {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;

      const parsedJson: unknown = JSON.parse(stored);
      const normalizedInput = normalizeSessionStateInput(parsedJson);
      const parsedState = SessionStateSchema.safeParse(normalizedInput);
      if (!parsedState.success) {
        console.warn("[SessionState] Invalid persisted state, clearing", {
          issues: parsedState.error.issues,
        });
        clearState();
        return null;
      }

      return parsedState.data;
    } catch (error) {
      console.warn("[SessionState] Failed to read state:", error);
      clearState();
      return null;
    }
  };

  /**
   * Create a snapshot of current state
   * Note: Navigation state is now managed by appRouter and persisted there
   */
  const createSnapshot = (blocks: BuilderNode[]): SessionState => {
    return SessionStateSchema.parse({
      currentPage: refs.currentPage.value ?? undefined,
      currentLayout: normalizeLayoutForSession(refs.currentLayout.value),
      currentComponent: refs.currentComponent.value,
      currentItemType: refs.currentItemType.value,
      selectedBlockId: refs.selectedBlockId.value,
      // Legacy fields - kept for backwards compat
      centerView: "builder",
      leftSidebarOpen: refs.leftSidebarOpen.value,
      rightSidebarOpen: refs.rightSidebarOpen.value,
      currentView: "studio",
      currentSettingsSection: refs.studioSection.value,
      timestamp: Date.now(),
      expandedBlocks: sanitizeBuilderNodeTree(blocks),
    });
  };

  /**
   * Save current state to sessionStorage
   */
  const saveState = (): boolean => {
    try {
      const state = createSnapshot(refs.pageBlocks.value);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn("[SessionState] Failed to save state:", error);
      return false;
    }
  };

  /**
   * Restore state from sessionStorage
   */
  const restoreState = (onRestore?: (state: SessionState) => void): boolean => {
    try {
      const state = readStoredState();
      if (!state) return false;

      const age = Date.now() - state.timestamp;

      // Only restore if session is recent (within timeout)
      if (age > SESSION_TIMEOUT_MS) {
        console.log("[SessionState] Session expired, clearing");
        clearState();
        return false;
      }

      if (onRestore) {
        onRestore(state);
        sessionRestored.value = true;
        return true;
      }

      return false;
    } catch (error) {
      console.warn("[SessionState] Failed to restore state:", error);
      return false;
    }
  };

  /**
   * Clear session state
   */
  const getSessionAge = (): number | null => {
    const state = readStoredState();
    return state ? Date.now() - state.timestamp : null;
  };

  /**
   * Check if session is valid
   */
  const isSessionValid = (): boolean => {
    const age = getSessionAge();
    return age !== null && age < SESSION_TIMEOUT_MS;
  };

  /**
   * Peek at session state without restoring
   */
  const peekState = (): SessionState | null => {
    try {
      return readStoredState();
    } catch (error) {
      console.warn("[SessionState] Failed to peek state:", error);
      return null;
    }
  };

  /**
   * Setup auto-save watchers
   */
  const setupAutoSave = (): (() => void)[] => {
    const stopWatchers: (() => void)[] = [];

    // Debounce timer for large pageBlocks saves
    let pageBlocksSaveTimer: ReturnType<typeof setTimeout> | null = null;

    // Save when page changes
    stopWatchers.push(watch(() => refs.currentPage.value?.id, saveState));

    // Save when layout changes
    stopWatchers.push(watch(() => refs.currentLayout.value?.id, saveState));

    // Save when component changes
    stopWatchers.push(watch(() => refs.currentComponent.value?.id, saveState));

    // Save when selection changes
    stopWatchers.push(watch(() => refs.selectedBlockId.value, saveState));

    // Save when sidebar state changes
    stopWatchers.push(
      watch(
        () => [refs.leftSidebarOpen.value, refs.rightSidebarOpen.value],
        saveState,
      ),
    );

    // Save when studio section changes
    stopWatchers.push(watch(() => refs.studioSection.value, saveState));

    // Save when page blocks change (debounced to avoid thrashing)
    stopWatchers.push(
      watch(
        () => refs.pageBlocks.value,
        () => {
          if (pageBlocksSaveTimer) {
            clearTimeout(pageBlocksSaveTimer);
          }
          pageBlocksSaveTimer = setTimeout(() => {
            saveState();
            pageBlocksSaveTimer = null;
          }, 300);
        },
        { deep: true },
      ),
    );

    return stopWatchers;
  };

  /**
   * Export state as JSON (for debugging or manual save)
   */
  const exportState = (): string => {
    const state = createSnapshot(refs.pageBlocks.value);
    return JSON.stringify(state, null, 2);
  };

  /**
   * Import state from JSON
   */
  const importState = (json: string): boolean => {
    try {
      const parsedJson: unknown = JSON.parse(json);
      const normalizedInput = normalizeSessionStateInput(parsedJson);
      const parsedState = SessionStateSchema.parse(normalizedInput);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsedState));
      return true;
    } catch (error) {
      console.warn("[SessionState] Failed to import state:", error);
      return false;
    }
  };

  return {
    saveState,
    restoreState,
    clearState,
    getSessionAge,
    isSessionValid,
    peekState,
    setupAutoSave,
    exportState,
    importState,
    sessionRestored,
  };
}
