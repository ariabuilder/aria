import { nextTick, ref, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNode, createSimplePage } from "../fixtures/testDataGenerator";
import type { DraftEntry } from "../../admin/features/Core/utils/draftCache";
import type { ComposerDraftPersistenceDeps } from "../../admin/features/Core/composables/useComposerDraftPersistence";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";

const { deleteDraftMock, getDraftMock, saveDraftMock } = vi.hoisted(() => ({
  deleteDraftMock: vi.fn(),
  getDraftMock: vi.fn(),
  saveDraftMock: vi.fn(),
}));

vi.mock("../../admin/features/Core/utils/draftCache", () => ({
  deleteDraft: deleteDraftMock,
  getDraft: getDraftMock,
  saveDraft: saveDraftMock,
}));

function createDeps() {
  const hero = createNode({ id: "hero" }) as unknown as BuilderNode;
  const page = createSimplePage("Home", {
    id: "page-home",
    slug: "home",
    title: "Home",
  }) as PageDSL;
  return {
    enabled: ref(true),
    pageBlocks: ref([hero]) as Ref<BuilderNode[]>,
    currentPage: ref<PageDSL | null>(page),
    currentLayout: ref<LayoutDSL | null>(null),
    currentComponent: ref<ComponentDSL | null>(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    hasUnsavedChanges: ref(true),
  };
}

describe("useComposerDraftPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDraftMock.mockResolvedValue(null);
    saveDraftMock.mockResolvedValue(undefined);
    deleteDraftMock.mockResolvedValue(undefined);
  });

  it("writes unsaved Composer changes locally without a server mutation", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );

    await nextTick();
    await drafts.flushLocalDraft();

    expect(saveDraftMock).toHaveBeenCalledWith(
      "pages",
      "page-home",
      expect.objectContaining({ nodes: [expect.objectContaining({ id: "hero" })] }),
      false,
      undefined,
    );
  });

  it("restores a matching local draft and leaves it marked dirty", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    const stored: DraftEntry = {
      id: "page-home",
      collection: "pages",
      dsl: {
        ...deps.currentPage.value!,
        nodes: [createNode({ id: "recovered" })],
      },
      lastModified: Date.now(),
      synced: false,
    };
    getDraftMock.mockResolvedValue(stored);

    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );
    await nextTick();
    await Promise.resolve();

    expect(drafts.pendingDraft.value).toEqual(stored);
    await expect(drafts.restorePendingDraft()).resolves.toBe(true);
    expect(deps.pageBlocks.value.map((node) => node.id)).toEqual(["recovered"]);
    expect(deps.hasUnsavedChanges.value).toBe(true);
  });

  it("does not restore a local draft over a newer server version", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    (deps.currentPage.value as { version?: string }).version = "server-v2";
    const stored: DraftEntry = {
      id: "page-home",
      collection: "pages",
      dsl: deps.currentPage.value! as unknown as DraftEntry["dsl"],
      lastModified: Date.now(),
      synced: false,
      baseVersion: "server-v1",
    };
    getDraftMock.mockResolvedValue(stored);

    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );
    await nextTick();
    await Promise.resolve();

    expect(drafts.hasDraftConflict.value).toBe(true);
    await expect(drafts.restorePendingDraft()).resolves.toBe(false);
  });

  it("keeps edits made during a manual save as an unsynced recovery draft", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );
    const savedSnapshot = JSON.stringify(deps.pageBlocks.value);
    deps.pageBlocks.value = [createNode({ id: "edited-during-save" })];

    await drafts.markCurrentDraftSynced("server-v2", savedSnapshot);

    expect(saveDraftMock).toHaveBeenLastCalledWith(
      "pages",
      "page-home",
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "edited-during-save" })],
      }),
      false,
      undefined,
    );
  });

  it("does not inspect or persist drafts outside an active Composer session", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    deps.enabled.value = false;
    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );

    await nextTick();
    await drafts.flushLocalDraft();

    expect(getDraftMock).not.toHaveBeenCalled();
    expect(saveDraftMock).not.toHaveBeenCalled();
  });

  it("cancels a queued draft write when Composer becomes inactive", async () => {
    vi.useFakeTimers();
    try {
      const { useComposerDraftPersistence } =
        await import("../../admin/features/Core/composables/useComposerDraftPersistence");
      const deps = createDeps();
      useComposerDraftPersistence(
        deps as unknown as ComposerDraftPersistenceDeps,
      );

      deps.pageBlocks.value = [createNode({ id: "queued-edit" })];
      await nextTick();
      deps.enabled.value = false;
      await vi.advanceTimersByTimeAsync(300);

      expect(saveDraftMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect a discarded draft on a later flush", async () => {
    const { useComposerDraftPersistence } =
      await import("../../admin/features/Core/composables/useComposerDraftPersistence");
    const deps = createDeps();
    const drafts = useComposerDraftPersistence(
      deps as unknown as ComposerDraftPersistenceDeps,
    );

    await nextTick();
    await drafts.discardCurrentDraft();
    await drafts.flushLocalDraft();

    expect(deleteDraftMock).toHaveBeenCalledWith("pages", "page-home");
    expect(deps.hasUnsavedChanges.value).toBe(false);
    expect(saveDraftMock).not.toHaveBeenCalled();
  });
});
