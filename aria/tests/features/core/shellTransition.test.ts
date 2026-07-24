import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ActiveStageKeySchema,
  MarkStageReadyInputSchema,
  StageKeySchema,
  buildStageKeyFromTarget,
  editingModeMatchesStageKey,
  editorContentMatchesTarget,
  parseStageKeyToTarget,
  STAGE_IDLE_KEY,
} from "@/features/Core/schemas/shellTransition";
import {
  __resetShellModeTransitionForTests,
  evaluateEnterComposerComplete,
  evaluateExitStudioComplete,
  tryCompleteTransition,
  useShellModeTransition,
} from "@/features/Core/composables/useShellModeTransition";
import type { ShellTransitionGateSnapshot } from "@/features/Core/schemas/shellTransition";

function baseEnterSnapshot(
  overrides: Partial<ShellTransitionGateSnapshot> = {},
): ShellTransitionGateSnapshot {
  return {
    isActive: true,
    direction: "to-composer",
    pendingStageKey: "stage-page-home",
    transitionGeneration: 1,
    stageReadyForKey: "stage-page-home",
    stageReadyGeneration: 1,
    studioShellMounted: false,
    studioPaintReady: false,
    isLoading: false,
    loadError: null,
    isEditing: true,
    showCanvas: true,
    editingItemType: "page",
    editingItemSlug: "home",
    bootComplete: true,
    minDisplayElapsed: true,
    editorContentAligned: true,
    ...overrides,
  };
}

describe("shellTransition schemas", () => {
  it("accepts active stage keys and idle", () => {
    expect(StageKeySchema.safeParse(STAGE_IDLE_KEY).success).toBe(true);
    expect(ActiveStageKeySchema.safeParse("stage-page-home").success).toBe(true);
  });

  it("rejects malformed stage keys", () => {
    expect(ActiveStageKeySchema.safeParse("stage-invalid").success).toBe(false);
    expect(MarkStageReadyInputSchema.safeParse({ stageKey: "nope", generation: 0 })
      .success).toBe(false);
  });

  it("parses stage key targets", () => {
    expect(parseStageKeyToTarget("stage-layout-main")).toEqual({
      itemType: "layout",
      itemSlug: "main",
    });
    expect(buildStageKeyFromTarget({ itemType: "page", itemSlug: "home" })).toBe(
      "stage-page-home",
    );
  });

  it("matches editing mode to stage key", () => {
    expect(
      editingModeMatchesStageKey("stage-page-home", "page", "home"),
    ).toBe(true);
    expect(
      editingModeMatchesStageKey("stage-page-home", "page", "about"),
    ).toBe(false);
  });
});

describe("useShellModeTransition gates", () => {
  beforeEach(() => {
    __resetShellModeTransitionForTests();
  });

  it("does not complete enter while loading", () => {
    expect(
      evaluateEnterComposerComplete(
        baseEnterSnapshot({ isLoading: true, stageReadyForKey: null }),
      ),
    ).toBe(false);
  });

  it("completes enter when all gates pass", () => {
    expect(evaluateEnterComposerComplete(baseEnterSnapshot())).toBe(true);
  });

  it("ignores stale stage-ready generation", () => {
    const shell = useShellModeTransition();
    shell.beginToComposer("stage-page-home");
    shell.markStageReady({ stageKey: "stage-page-home", generation: 0 });
    expect(
      evaluateEnterComposerComplete(
        shell.buildGateSnapshot({
          isLoading: false,
          loadError: null,
          isEditing: true,
          showCanvas: true,
          editingItemType: "page",
          editingItemSlug: "home",
          bootComplete: true,
          editorContentAligned: true,
        }),
      ),
    ).toBe(false);
  });

  it("completes enter when markStageReady fires after gates are satisfied", () => {
    vi.useFakeTimers();
    const shell = useShellModeTransition();
    shell.beginToComposer("stage-page-home");

    const deps = {
      isLoading: false,
      loadError: null,
      isEditing: true,
      showCanvas: true,
      editingItemType: "page" as const,
      editingItemSlug: "home",
      bootComplete: true,
      editorContentAligned: true,
    };

    vi.advanceTimersByTime(200);

    shell.markStageReady({
      stageKey: "stage-page-home",
      generation: shell.transitionGeneration.value,
    });

    expect(shell.tryCompleteFromDeps(deps)).toBe("enter-complete");
    expect(shell.isActive.value).toBe(false);
    vi.useRealTimers();
  });

  it("ignores stage-ready for wrong key after switch", () => {
    const shell = useShellModeTransition();
    shell.beginToComposer("stage-page-home");
    const gen = shell.transitionGeneration.value;
    shell.markStageReady({ stageKey: "stage-page-home", generation: gen });
    shell.beginToComposer("stage-page-about");
    expect(
      tryCompleteTransition(
        shell.buildGateSnapshot({
          isLoading: false,
          loadError: null,
          isEditing: true,
          showCanvas: true,
          editingItemType: "page",
          editingItemSlug: "about",
          bootComplete: true,
          editorContentAligned: true,
        }),
      ),
    ).toBeNull();
  });

  it("dismisses on load error", () => {
    const shell = useShellModeTransition();
    shell.beginToComposer("stage-page-home");
    const result = tryCompleteTransition(
      baseEnterSnapshot({ loadError: "Failed to load" }),
    );
    expect(result).toBe("error-dismiss");
    expect(shell.isActive.value).toBe(false);
  });

  it("completes exit when studio paint is ready", () => {
    expect(
      evaluateExitStudioComplete({
        isActive: true,
        direction: "to-studio",
        pendingStageKey: null,
        transitionGeneration: 2,
        stageReadyForKey: null,
        stageReadyGeneration: null,
        studioShellMounted: true,
        studioPaintReady: true,
        isLoading: false,
        loadError: null,
        isEditing: false,
        showCanvas: false,
        editingItemType: null,
        editingItemSlug: null,
        bootComplete: true,
        minDisplayElapsed: true,
        editorContentAligned: true,
      }),
    ).toBe(true);
  });

  it("does not complete enter when editor content slug mismatches", () => {
    expect(
      evaluateEnterComposerComplete(
        baseEnterSnapshot({ editorContentAligned: false }),
      ),
    ).toBe(false);
  });

  it("matches editor content to editing target", () => {
    expect(
      editorContentMatchesTarget({
        editingItemType: "page",
        editingItemSlug: "home",
        currentPageSlug: "home",
        currentLayoutSlug: null,
        currentComponentSlug: null,
      }),
    ).toBe(true);
    expect(
      editorContentMatchesTarget({
        editingItemType: "page",
        editingItemSlug: "home",
        currentPageSlug: "about",
        currentLayoutSlug: null,
        currentComponentSlug: null,
      }),
    ).toBe(false);
  });

  it("does not start enter without editing alignment", () => {
    expect(
      evaluateEnterComposerComplete(
        baseEnterSnapshot({
          editingItemSlug: "other",
          stageReadyForKey: "stage-page-home",
        }),
      ),
    ).toBe(false);
  });
});
