import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, type Ref } from "vue";
import type { LayoutDSL } from "../../../lib/types/nodes";
import { useActiveLayoutSlot } from "../../../admin/features/Core/composables/useActiveLayoutSlot";
import { getSlotScope } from "../../../lib/layouts/slotEditing";

const toastFn = vi.fn();

vi.mock("vue-sonner", () => ({
  toast: (...args: unknown[]) => toastFn(...args),
}));

const layoutWithSlots = {
  id: "layout-1",
  title: "Full Width",
  name: "full-width",
  slots: [
    { name: "header", label: "Header" },
    { name: "main", isDefault: true, label: "Main" },
    { name: "footer", label: "Footer" },
  ],
} as LayoutDSL;

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

describe("useActiveLayoutSlot", () => {
  beforeEach(() => {
    toastFn.mockClear();
  });

  function createSlotState() {
    const currentLayout = layoutRef(layoutWithSlots);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const api = useActiveLayoutSlot({ currentLayout, currentItemType });
    return { currentLayout, currentItemType, api };
  }

  it("enters layout scope for shared slots while editing a page", () => {
    const { api } = createSlotState();

    expect(getSlotScope("main", layoutWithSlots)).toBe("page");
    expect(getSlotScope("footer", layoutWithSlots)).toBe("layout");

    api.enterSlot("footer");

    expect(api.activeSlot.value).toMatchObject({
      name: "footer",
      scope: "layout",
    });
    expect(api.isLayoutSlotEditing.value).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("enters layout scope when switching between shared slots on a page", () => {
    const { api } = createSlotState();

    api.enterSlot("footer");
    api.enterSlot("header");

    expect(toastFn).not.toHaveBeenCalled();
    expect(api.activeSlot.value.name).toBe("header");
    expect(api.activeSlot.value.scope).toBe("layout");
    expect(api.isLayoutSlotEditing.value).toBe(true);
  });

  it("uses layout override from options when app layout ref is empty", () => {
    const currentLayout = layoutRef(null);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const api = useActiveLayoutSlot({ currentLayout, currentItemType });

    api.enterSlot("footer", { layout: layoutWithSlots });

    expect(api.activeSlot.value.scope).toBe("layout");
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("returns to page scope when entering the default page slot", () => {
    const { api } = createSlotState();

    api.enterSlot("footer");
    toastFn.mockClear();

    api.enterSlot("main");

    expect(api.isLayoutSlotEditing.value).toBe(false);
    expect(api.activeSlot.value.scope).toBe("page");
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("uses layout scope while editing the layout itself", () => {
    const currentLayout = layoutRef(layoutWithSlots);
    const currentItemType = ref<"page" | "layout" | "component">("layout");
    const api = useActiveLayoutSlot({ currentLayout, currentItemType });

    api.enterSlot("footer");

    expect(api.activeSlot.value.scope).toBe("layout");
    expect(api.isLayoutSlotEditing.value).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("does not toast when slot resolves to page scope", () => {
    const currentLayout = layoutRef({
      id: "layout-2",
      slots: [{ name: "main", isDefault: true }],
    } as LayoutDSL);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const api = useActiveLayoutSlot({ currentLayout, currentItemType });

    api.enterSlot("unknown-slot");

    expect(api.activeSlotScope.value).toBe("page");
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("setActiveSlot delegates to enterSlot", () => {
    const { api } = createSlotState();

    api.setActiveSlot("footer");

    expect(toastFn).not.toHaveBeenCalled();
    expect(api.activeSlot.value.name).toBe("footer");
    expect(api.activeSlot.value.scope).toBe("layout");
  });

  it("uses layout scope for custom non-default slots", () => {
    const currentLayout = layoutRef({
      id: "layout-3",
      slots: [
        { name: "header", label: "Header" },
        { name: "main", isDefault: true },
        { name: "announcement-bar" },
      ],
    } as LayoutDSL);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const api = useActiveLayoutSlot({ currentLayout, currentItemType });

    api.enterSlot("announcement-bar");

    expect(api.activeSlot.value).toMatchObject({
      name: "announcement-bar",
      scope: "layout",
    });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("enters layout scope for header slot on a page", () => {
    const { api } = createSlotState();

    api.enterSlot("header");

    expect(api.activeSlot.value).toMatchObject({
      name: "header",
      scope: "layout",
    });
    expect(api.isLayoutSlotEditing.value).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
  });
});
