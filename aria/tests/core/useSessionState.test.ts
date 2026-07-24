/**
 * useSessionState Tests
 *
 * @vitest-environment jsdom
 */

import { computed, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionState } from "@/features/Core/session/useSessionState";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "@/lib/types/nodes";
import {
  createNode,
  createSimpleComponent,
  createSimpleLayout,
  createSimplePage,
} from "../fixtures/testDataGenerator";

const SESSION_STORAGE_KEY = "aria-builder-session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function componentRef(component: ComponentDSL | null): Ref<ComponentDSL | null> {
  return ref(component as unknown) as Ref<ComponentDSL | null>;
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function createSessionStorageMock() {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}

function createRefs() {
  return {
    currentPage: pageRef(
      createSimplePage("Session Page", { slug: "session-page" }),
    ),
    currentLayout: layoutRef(
      createSimpleLayout("Session Layout", { id: "session-layout" }),
    ),
    currentComponent: componentRef(
      createSimpleComponent("Session Component", { id: "session-component" }),
    ),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    selectedBlockId: ref("node-selected"),
    leftSidebarOpen: computed(() => true),
    rightSidebarOpen: computed(() => false),
    studioSection: computed(() => "pages"),
    pageBlocks: pageBlocksRef([createNode({ id: "node-selected" })]),
  };
}

describe("useSessionState", () => {
  const sessionStorageMock = createSessionStorageMock();

  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();

    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      writable: true,
    });

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("saves and restores a validated session snapshot", () => {
    const sourceSession = useSessionState(createRefs());
    expect(sourceSession.saveState()).toBe(true);

    const restoreSpy = vi.fn();
    const targetSession = useSessionState(createRefs());

    expect(targetSession.restoreState(restoreSpy)).toBe(true);
    expect(restoreSpy).toHaveBeenCalledTimes(1);

    const restoredState = restoreSpy.mock.calls[0]?.[0];
    expect(restoredState?.currentPage?.slug).toBe("session-page");
    expect(restoredState?.currentLayout?.id).toBe("session-layout");
    expect(restoredState?.currentComponent?.id).toBe("session-component");
    expect(restoredState?.selectedBlockId).toBe("node-selected");
    expect(restoredState?.expandedBlocks).toHaveLength(1);
  });

  it("normalizes lightweight layout snapshots before persisting them", () => {
    const refs = createRefs();
    refs.currentLayout.value = {
      id: "compose-layout",
      slug: "compose-layout",
      title: "Compose Layout",
      description: "Compose Layout",
      nodes: [],
      slots: [{ name: "main", label: "Main", required: true }],
      metadata: { regions: {} },
    } as unknown as LayoutDSL;

    const sessionState = useSessionState(refs);

    expect(sessionState.saveState()).toBe(true);

    const storedState = JSON.parse(
      sessionStorageMock.getItem(SESSION_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown>;
    const storedLayout = storedState.currentLayout as Record<string, unknown>;

    expect(storedLayout.name).toBe("Compose Layout");
    expect(storedLayout.title).toBe("Compose Layout");
    expect(storedLayout.layoutMetadata).toEqual({ regions: {} });
    expect(storedLayout.settings).toEqual({});
  });

  it("clears invalid persisted payloads before restore", () => {
    sessionStorageMock.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        currentItemType: "page",
        timestamp: Date.now(),
      }),
    );

    const sessionState = useSessionState(createRefs());

    expect(sessionState.restoreState()).toBe(false);
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
      SESSION_STORAGE_KEY,
    );
    expect(sessionState.peekState()).toBeNull();
  });

  it("expires stale sessions and removes them from storage", () => {
    const sessionState = useSessionState(createRefs());
    expect(sessionState.saveState()).toBe(true);

    const savedState = JSON.parse(
      sessionStorageMock.getItem(SESSION_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown>;
    savedState.timestamp = Date.now() - SESSION_TIMEOUT_MS - 1;
    sessionStorageMock.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedState));

    expect(sessionState.restoreState()).toBe(false);
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
      SESSION_STORAGE_KEY,
    );
  });

  it("rejects invalid imported session state", () => {
    const sessionState = useSessionState(createRefs());

    expect(
      sessionState.importState(
        JSON.stringify({
          currentItemType: "page",
          timestamp: Date.now(),
        }),
      ),
    ).toBe(false);
    expect(sessionStorageMock.setItem).not.toHaveBeenCalledWith(
      SESSION_STORAGE_KEY,
      expect.any(String),
    );
  });
});
