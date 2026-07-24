import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import {
  deleteDraft,
  getDraft,
  saveDraft,
  type DraftEntry,
} from "../utils/draftCache";

type ComposerItemType = "page" | "layout" | "component";
type DraftCollection = "pages" | "layouts" | "components";
type DraftDocument = PageDSL | LayoutDSL | ComponentDSL;

export interface ComposerDraftPersistenceDeps {
  enabled: Ref<boolean>;
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<ComposerItemType>;
  hasUnsavedChanges: Ref<boolean>;
}

export interface UseComposerDraftPersistenceReturn {
  pendingDraft: Readonly<Ref<DraftEntry | null>>;
  hasDraftConflict: Readonly<Ref<boolean>>;
  isPersistingLocally: Readonly<Ref<boolean>>;
  localError: Readonly<Ref<string | null>>;
  flushLocalDraft: () => Promise<void>;
  markCurrentDraftSynced: (
    version: string,
    persistedBlocksSnapshot: string,
  ) => Promise<void>;
  restorePendingDraft: () => Promise<boolean>;
  discardPendingDraft: () => Promise<void>;
  discardCurrentDraft: () => Promise<void>;
}

const DRAFT_WRITE_DEBOUNCE_MS = 300;

function cloneDocument<T extends DraftDocument>(document: T): T {
  return JSON.parse(JSON.stringify(document)) as T;
}

function cloneNodes(nodes: BuilderNode[]): BuilderNode[] {
  return JSON.parse(JSON.stringify(nodes)) as BuilderNode[];
}

function versionForDocument(document: DraftDocument): string | undefined {
  const version = (document as { version?: unknown }).version;
  return typeof version === "string" && version.length > 0
    ? version
    : undefined;
}

export function useComposerDraftPersistence(
  deps: ComposerDraftPersistenceDeps,
): UseComposerDraftPersistenceReturn {
  const {
    enabled,
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    hasUnsavedChanges,
  } = deps;

  const pendingDraft = ref<DraftEntry | null>(null);
  const hasDraftConflict = ref(false);
  const isPersistingLocally = ref(false);
  const localError = ref<string | null>(null);
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let restorationInProgress = false;
  let draftLoadGeneration = 0;

  const activeDocument = computed<DraftDocument | null>(() => {
    if (currentItemType.value === "page") return currentPage.value;
    if (currentItemType.value === "layout") return currentLayout.value;
    return currentComponent.value;
  });

  const activeDraftTarget = computed<
    | {
        collection: DraftCollection;
        id: string;
        document: DraftDocument;
      }
    | null
  >(() => {
    const document = activeDocument.value;
    if (!document) return null;

    if (currentItemType.value === "page") {
      const page = document as PageDSL;
      return page.id
        ? { collection: "pages", id: page.id, document: page }
        : null;
    }

    if (currentItemType.value === "layout") {
      const layout = document as LayoutDSL;
      const id = layout.id ?? layout.slug;
      return id ? { collection: "layouts", id, document: layout } : null;
    }

    const component = document as ComponentDSL;
    return component.id
      ? { collection: "components", id: component.id, document: component }
      : null;
  });

  function buildDraftDocument(document: DraftDocument): DraftDocument {
    return {
      ...cloneDocument(document),
      nodes: cloneNodes(pageBlocks.value),
    } as DraftDocument;
  }

  function clearWriteTimer(): void {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
  }

  async function flushLocalDraft(): Promise<void> {
    clearWriteTimer();
    const target = activeDraftTarget.value;
    if (
      !enabled.value ||
      !target ||
      !hasUnsavedChanges.value ||
      restorationInProgress
    ) {
      return;
    }

    isPersistingLocally.value = true;
    localError.value = null;
    try {
      await saveDraft(
        target.collection,
        target.id,
        buildDraftDocument(target.document),
        false,
        versionForDocument(target.document),
      );
    } catch (error) {
      localError.value =
        error instanceof Error ? error.message : "Failed to protect local draft";
    } finally {
      isPersistingLocally.value = false;
    }
  }

  function scheduleLocalDraftWrite(): void {
    clearWriteTimer();
    if (!enabled.value || !hasUnsavedChanges.value || restorationInProgress) {
      return;
    }

    writeTimer = setTimeout(() => {
      writeTimer = null;
      void flushLocalDraft();
    }, DRAFT_WRITE_DEBOUNCE_MS);
  }

  async function loadPendingDraft(): Promise<void> {
    const target = enabled.value ? activeDraftTarget.value : null;
    const loadGeneration = ++draftLoadGeneration;
    pendingDraft.value = null;
    hasDraftConflict.value = false;
    if (!target) return;

    try {
      const stored = await getDraft(target.collection, target.id);
      if (!enabled.value || loadGeneration !== draftLoadGeneration) return;
      if (!stored || stored.synced) return;

      pendingDraft.value = stored;
      const localBaseVersion = stored.baseVersion;
      const remoteVersion = versionForDocument(target.document);
      hasDraftConflict.value = Boolean(
        localBaseVersion && remoteVersion && localBaseVersion !== remoteVersion,
      );
    } catch (error) {
      if (loadGeneration !== draftLoadGeneration) return;
      localError.value =
        error instanceof Error ? error.message : "Failed to inspect local draft";
    }
  }

  async function restorePendingDraft(): Promise<boolean> {
    const target = activeDraftTarget.value;
    const draft = pendingDraft.value;
    if (
      !enabled.value ||
      !target ||
      !draft ||
      target.collection !== draft.collection ||
      target.id !== draft.id ||
      hasDraftConflict.value
    ) {
      return false;
    }

    restorationInProgress = true;
    try {
      const restored = JSON.parse(JSON.stringify(draft.dsl)) as {
        nodes?: BuilderNode[];
        slots?: LayoutDSL["slots"];
      };
      pageBlocks.value = restored.nodes ?? [];
      if (currentItemType.value === "layout" && currentLayout.value) {
        currentLayout.value = {
          ...currentLayout.value,
          slots: restored.slots ?? [],
        };
      }
      hasUnsavedChanges.value = true;
      pendingDraft.value = null;
      return true;
    } finally {
      restorationInProgress = false;
      scheduleLocalDraftWrite();
    }
  }

  async function discardPendingDraft(): Promise<void> {
    const draft = pendingDraft.value;
    if (draft) {
      await deleteDraft(draft.collection, draft.id);
    }
    if (pendingDraft.value === draft) {
      pendingDraft.value = null;
      hasDraftConflict.value = false;
    }
  }

  async function discardCurrentDraft(): Promise<void> {
    const target = activeDraftTarget.value;
    if (!target) return;
    clearWriteTimer();
    await deleteDraft(target.collection, target.id);
    hasUnsavedChanges.value = false;
    pendingDraft.value = null;
    hasDraftConflict.value = false;
  }

  async function markCurrentDraftSynced(
    version: string,
    persistedBlocksSnapshot: string,
  ): Promise<void> {
    const target = activeDraftTarget.value;
    if (!target) return;

    clearWriteTimer();
    if (JSON.stringify(pageBlocks.value) !== persistedBlocksSnapshot) {
      await flushLocalDraft();
      return;
    }

    await saveDraft(
      target.collection,
      target.id,
      buildDraftDocument(target.document),
      true,
      version,
    );
    pendingDraft.value = null;
    hasDraftConflict.value = false;
  }

  watch(
    () =>
      enabled.value && activeDraftTarget.value
        ? `${activeDraftTarget.value.collection}:${activeDraftTarget.value.id}`
        : null,
    () => {
      void loadPendingDraft();
    },
    { immediate: true },
  );

  watch(
    enabled,
    (isEnabled) => {
      if (isEnabled) return;

      clearWriteTimer();
      draftLoadGeneration += 1;
      pendingDraft.value = null;
      hasDraftConflict.value = false;
    },
    { flush: "sync" },
  );

  watch(
    [pageBlocks, currentLayout, hasUnsavedChanges],
    () => scheduleLocalDraftWrite(),
    { deep: true },
  );

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      void flushLocalDraft();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  onBeforeUnmount(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    void flushLocalDraft();
  });

  return {
    pendingDraft,
    hasDraftConflict,
    isPersistingLocally,
    localError,
    flushLocalDraft,
    markCurrentDraftSynced,
    restorePendingDraft,
    discardPendingDraft,
    discardCurrentDraft,
  } as UseComposerDraftPersistenceReturn;
}
