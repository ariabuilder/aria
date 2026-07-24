import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { __resetShellModeTransitionForTests } from "../../../admin/features/Core/composables/useShellModeTransition";

/**
 * These suites only assert mount/lifecycle wiring. Stub the heavy canvas
 * SFCs so Vitest does not compile ComposerStage / StageViewport graphs.
 */
vi.mock("../../../admin/features/Composer/components/ComposerStage.vue", () => ({
  default: defineComponent({
    name: "ComposerStage",
    emits: [
      "ready",
      "select-block",
      "add-block",
      "delete-block",
      "duplicate-block",
      "detach-component",
      "replace-block-with-component",
      "edit-component",
      "reorder-block",
      "open-picker",
      "edit-layout-region",
      "add-first-element",
    ],
    setup(_, { emit, expose }) {
      expose({
        stageFrameRef: { iframeRef: null },
      });
      return () =>
        h("div", {
          "data-test": "composer-stage-stub",
          onVnodeMounted: () => emit("ready"),
        });
    },
  }),
}));

vi.mock("../../../admin/features/Stage/components/StageViewport.vue", () => ({
  default: defineComponent({
    name: "StageViewport",
    setup(_, { slots }) {
      return () => h("div", { "data-test": "stage-viewport-stub" }, slots.default?.());
    },
  }),
}));

vi.mock("../../../admin/features/Stage/components/EmptyComponentState.vue", () => ({
  default: defineComponent({
    name: "EmptyComponentState",
    setup() {
      return () => h("div", { "data-test": "empty-component-state-stub" });
    },
  }),
}));

const baseProps = {
  stageKey: "stage-page-home",
  currentItemType: "page" as const,
  currentItemSlug: "home",
  headerComponent: undefined,
  footerComponent: undefined,
  expandedBlocks: [],
  isLoading: true,
  loadError: null,
  showOutlines: false,
  wireframeMode: false,
  pageSlug: "home",
  currentLayout: null,
};

describe("StageCanvasRuntime loading lifecycle", () => {
  beforeEach(() => {
    __resetShellModeTransitionForTests();
  });

  it("mounts the replacement stage after data loading and forwards readiness", async () => {
    const StageCanvasRuntime = (
      await import("../../../admin/features/Stage/components/StageCanvasRuntime.vue")
    ).default;

    const wrapper = shallowMount(StageCanvasRuntime, {
      props: baseProps,
    });

    expect(wrapper.find("composer-stage-stub").exists()).toBe(false);

    await wrapper.setProps({ isLoading: false });

    expect(wrapper.find("composer-stage-stub").exists()).toBe(true);

    wrapper.getComponent({ name: "ComposerStage" }).vm.$emit("ready");
    await nextTick();

    expect(wrapper.emitted("ready")).toHaveLength(1);
  });

  it("shows the canvas error without mounting a stale stage", async () => {
    const StageCanvasRuntime = (
      await import("../../../admin/features/Stage/components/StageCanvasRuntime.vue")
    ).default;

    const wrapper = shallowMount(StageCanvasRuntime, {
      props: baseProps,
    });

    await wrapper.setProps({
      isLoading: false,
      loadError: "Unable to load page",
    });

    expect(wrapper.find("composer-stage-stub").exists()).toBe(false);
    expect(wrapper.find("stage-load-state-stub").exists()).toBe(true);
  });
});

describe("AppCanvasShell transition overlay", () => {
  beforeEach(() => {
    __resetShellModeTransitionForTests();
  });

  it("renders an unscaled, full-size preloader above the canvas viewport", async () => {
    const AppCanvasShell = (
      await import("../../../admin/features/Core/components/AppCanvasShell.vue")
    ).default;

    const wrapper = shallowMount(AppCanvasShell, {
      props: {
        show: true,
        page: null,
        leftSidebarOpen: true,
        rightSidebarOpen: true,
        onToggleLeftSidebar: () => undefined,
        onToggleRightSidebar: () => undefined,
        isLoading: true,
        isItemTransitioning: true,
        loadError: null,
        showOutlines: false,
        wireframeMode: false,
        currentLayout: null,
        stageKey: "stage-page-home",
        currentItemType: "page",
        currentItemSlug: "home",
        headerComponent: undefined,
        footerComponent: undefined,
        expandedBlocks: [],
        pageSlug: "home",
        showEmptyComponentState: false,
      },
    });

    const loader = wrapper.find("stage-load-state-stub");
    expect(loader.exists()).toBe(true);

    await wrapper.setProps({ isItemTransitioning: false });
    expect(wrapper.find("stage-load-state-stub").exists()).toBe(false);
  });

  it("uses the non-compact logo by default", async () => {
    const StageLoadState = (
      await import("../../../admin/features/Stage/components/StageLoadState.vue")
    ).default;

    const wrapper = mount(StageLoadState, {
      props: {
        isLoading: true,
        loadError: null,
      },
    });

    expect(wrapper.find(".preloader-aria-logo").exists()).toBe(true);
    expect(wrapper.find(".preloader-aria-logo--compact").exists()).toBe(false);
  });
});
