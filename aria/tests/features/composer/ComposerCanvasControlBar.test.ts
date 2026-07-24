import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipProvider: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  DropdownMenuContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  DropdownMenuItem: defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      return () =>
        h(
          "button",
          {
            type: "button",
            ...attrs,
          },
          slots.default?.(),
        );
    },
  }),
  DropdownMenuTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      return () =>
        h(
          "button",
          {
            type: "button",
            ...attrs,
          },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("@/features/Stage/components/StageMarkupPreviewPopover.vue", () => ({
  default: defineComponent({
    name: "StageMarkupPreviewPopover",
    setup() {
      return () => h("div", { "data-testid": "markup-preview" });
    },
  }),
}));

const setViewportMock = vi.fn();
const toggleScaleModeMock = vi.fn();
const zoomInMock = vi.fn();
const zoomOutMock = vi.fn();
const selectZoomPresetMock = vi.fn();

vi.mock("../../../admin/composables/useViewport", () => ({
  useViewport: () => ({
    viewport: ref("base"),
    setViewport: setViewportMock,
  }),
}));

vi.mock("../../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeViewports: ref([
      {
        id: "testing",
        label: "Testing",
        icon: "Monitor",
        width: 2400,
        minWidth: 2400,
      },
      {
        id: "base",
        label: "Desktop",
        icon: "Monitor",
        width: 1440,
        minWidth: 1440,
      },
    ]),
  }),
}));

vi.mock("../../../admin/features/Stage/composables/useZoom", () => ({
  useZoom: () => ({
    zoom: ref(58),
    isFitMode: ref(true),
    isMinZoom: ref(false),
    isMaxZoom: ref(false),
    toggleScaleMode: toggleScaleModeMock,
    zoomIn: zoomInMock,
    zoomOut: zoomOutMock,
    selectZoomPreset: selectZoomPresetMock,
  }),
}));

vi.mock("../../../admin/features/History", () => ({
  useHistoryState: () => ({
    canUndo: ref(true),
    canRedo: ref(false),
  }),
}));

import ComposerCanvasControlBar from "../../../admin/features/Composer/components/ComposerCanvasControlBar.vue";

describe("ComposerCanvasControlBar", () => {
  it("renders viewport controls and emits save/publish/undo", async () => {
    const wrapper = mount(ComposerCanvasControlBar, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        currentPage: {
          id: "page-1",
          slug: "home",
          title: "Home",
          status: "draft",
          layout: "default",
          nodes: [],
        },
        canSave: true,
        canPublish: true,
        hasUnsavedChanges: true,
        isSaving: false,
        isPublishing: false,
        isLoading: false,
      },
    });

    expect(wrapper.find('[data-testid="composer-canvas-control-bar"]').exists()).toBe(
      true,
    );

    const header = wrapper.find('[data-testid="composer-canvas-control-bar"]');
    expect(header.classes()).toEqual(
      expect.arrayContaining(["h-10", "border-dashed", "bg-input"]),
    );

    const viewportButtons = wrapper.findAll("button[aria-label*='Testing']");
    expect(viewportButtons.length).toBe(1);
    await viewportButtons[0]!.trigger("click");
    expect(setViewportMock).toHaveBeenCalledWith("testing");

    const scaleToggle = wrapper.find(
      'button[aria-label="Switch to actual size · 58% fit"]',
    );
    await scaleToggle.trigger("click");
    expect(toggleScaleModeMock).toHaveBeenCalled();

    const zoomOutButton = wrapper.find('button[aria-label="Zoom out"]');
    await zoomOutButton.trigger("click");
    expect(zoomOutMock).toHaveBeenCalled();

    const zoomInButton = wrapper.find('button[aria-label="Zoom in"]');
    await zoomInButton.trigger("click");
    expect(zoomInMock).toHaveBeenCalled();

    const zoomLabelButton = wrapper.find('button[aria-label="Zoom 58%"]');
    expect(zoomLabelButton.exists()).toBe(true);
    expect(zoomLabelButton.text()).toBe("58%");

    const presetButtons = wrapper.findAll("button").filter((button) =>
      button.text().endsWith("%") && button.text() !== "58%",
    );
    const preset125 = presetButtons.find((button) => button.text() === "125%");
    expect(preset125).toBeTruthy();
    await preset125!.trigger("click");
    expect(selectZoomPresetMock).toHaveBeenCalledWith(125);

    const saveButtons = wrapper.findAll("button").filter((button) =>
      button.attributes("aria-label")?.includes("Save"),
    );
    expect(saveButtons.length).toBeGreaterThan(0);
    await saveButtons[0]!.trigger("click");
    expect(wrapper.emitted("save")).toBeTruthy();

    const publishButtons = wrapper.findAll("button").filter((button) =>
      button.attributes("aria-label")?.includes("Publish"),
    );
    expect(publishButtons.length).toBeGreaterThan(0);
    await publishButtons[0]!.trigger("click");
    expect(wrapper.emitted("publish")).toBeTruthy();

    const undoButton = wrapper.find('button[aria-label="Undo"]');
    await undoButton.trigger("click");
    expect(wrapper.emitted("undo")).toBeTruthy();
  });

  it("disables save while publishing", () => {
    const wrapper = mount(ComposerCanvasControlBar, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        currentPage: {
          id: "page-1",
          slug: "home",
          title: "Home",
          status: "draft",
          layout: "default",
          nodes: [],
        },
        canSave: true,
        canPublish: true,
        hasUnsavedChanges: true,
        isSaving: false,
        isPublishing: true,
        isLoading: false,
      },
    });

    const saveButtons = wrapper.findAll("button").filter((button) =>
      button.attributes("aria-label")?.includes("Save"),
    );
    expect(saveButtons[0]?.attributes("disabled")).toBeDefined();
  });

  it("disables zoom buttons at min and max zoom", async () => {
    vi.resetModules();

    vi.doMock("../../../admin/features/Stage/composables/useZoom", () => ({
      useZoom: () => ({
        zoom: ref(10),
        isFitMode: ref(false),
        isMinZoom: ref(true),
        isMaxZoom: ref(false),
        toggleScaleMode: toggleScaleModeMock,
        zoomIn: zoomInMock,
        zoomOut: zoomOutMock,
        selectZoomPreset: selectZoomPresetMock,
      }),
    }));

    const { default: ControlBarAtMin } = await import(
      "../../../admin/features/Composer/components/ComposerCanvasControlBar.vue"
    );

    const minWrapper = mount(ControlBarAtMin, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        canSave: false,
        isLoading: false,
      },
    });

    expect(
      minWrapper.find('button[aria-label="Zoom out"]').attributes("disabled"),
    ).toBeDefined();
  });
});
