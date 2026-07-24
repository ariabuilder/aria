import { effectScope, nextTick, ref, type Ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import { useComposerDirtyTracking } from "@/features/Core/composables/useAppInitialization";
import type {
  BuilderNode,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";
import { createNode, createSimplePage } from "../fixtures/testDataGenerator";

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

const scopes: ReturnType<typeof effectScope>[] = [];

afterEach(() => {
  while (scopes.length > 0) scopes.pop()?.stop();
});

function createHarness() {
  const initialBlocks = [createNode({ id: "old-root" })];
  const refs = {
    pageBlocks: ref(initialBlocks) as Ref<BuilderNode[]>,
    currentPage: pageRef(
      createSimplePage("Old", {
        id: "old",
        slug: "old",
        layout: "default",
      }),
    ),
    currentLayout: layoutRef(null),
    hasUnsavedChanges: ref(false),
    lastSavedSnapshot: ref("snapshot:old-root"),
    layoutSlotsSnapshot: ref("[]"),
    loadingState: ref({
      isLoading: false,
      isSaving: false,
      isPublishing: false,
      loadError: null,
    }),
    createSnapshot: (blocks: BuilderNode[]) =>
      `snapshot:${blocks.map((block) => block.id).join(",")}`,
  };
  const scope = effectScope();
  scopes.push(scope);
  scope.run(() => useComposerDirtyTracking(refs));
  return refs;
}

describe("useComposerDirtyTracking", () => {
  it("keeps a hydrated page clean when its layout changes during loading", async () => {
    const refs = createHarness();
    const loadedBlocks = [createNode({ id: "new-root" })];

    refs.loadingState.value.isLoading = true;
    refs.currentPage.value = null;
    refs.pageBlocks.value = [];
    refs.currentPage.value = createSimplePage("New", {
      id: "new",
      slug: "new",
      layout: undefined,
    });
    refs.pageBlocks.value = loadedBlocks;
    refs.lastSavedSnapshot.value = refs.createSnapshot(loadedBlocks);
    refs.layoutSlotsSnapshot.value = "[]";
    refs.hasUnsavedChanges.value = false;
    refs.loadingState.value.isLoading = false;

    await nextTick();

    expect(refs.hasUnsavedChanges.value).toBe(false);
  });

  it("marks an explicit post-load layout change dirty", () => {
    const refs = createHarness();

    refs.currentPage.value!.layout = "marketing";

    expect(refs.hasUnsavedChanges.value).toBe(true);
  });
});
