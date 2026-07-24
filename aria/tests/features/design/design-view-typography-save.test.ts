import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";

const { loadVariableManagerBootstrapMock } = vi.hoisted(() => ({
  loadVariableManagerBootstrapMock: vi.fn(async () => undefined),
}));

vi.mock("../../../admin/features/Design/composables", () => ({
  useDesignViewState: () => ({
    canUndo: computed(() => false),
    canRedo: computed(() => false),
    isSaving: ref(false),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    currentView: computed(() => "typography"),
    currentConfig: computed(() => ({
      icon: "i-test",
      label: "Typography",
      description: "Configure typography",
    })),
    sectionGroups: computed(() => []),
    setSection: vi.fn(),
  }),
}));

vi.mock(
  "../../../admin/features/Design/composables/useVariableManagerBootstrap",
  () => ({
    useVariableManagerBootstrap: () => ({
      loadVariableManagerBootstrap: loadVariableManagerBootstrapMock,
    }),
  }),
);

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    setup(_props, { slots }) {
      return () => h("button", slots.default?.());
    },
  }),
}));

vi.mock("@/features/Studio/core/components", () => ({
  PageHeader: defineComponent({
    setup(_props, { slots }) {
      return () =>
        h("div", [slots.search?.(), slots.toolbar?.(), slots.actions?.()]);
    },
  }),
  StudioLeftRailReveal: defineComponent({
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

const StubView = defineComponent({
  setup() {
    return () => h("div");
  },
});

import DesignView from "../../../admin/features/Design/views/DesignView.vue";

describe("DesignView typography save", () => {
  beforeEach(() => {
    loadVariableManagerBootstrapMock.mockClear();
  });

  it("bootstraps variable manager data when typography view mounts", async () => {
    const wrapper = mount(DesignView, {
      global: {
        stubs: {
          DesignOrganizerRail: StubView,
          FrameworkView: StubView,
          BreakpointsView: StubView,
          ColorSystemView: StubView,
          FontView: StubView,
          IconsView: StubView,
          DesignPlaceholderView: StubView,
          GlobalStylesView: StubView,
          VariableManagerView: StubView,
          ClassManagerView: StubView,
          DesignAssetImportDialog: StubView,
          HeaderActionTooltip: StubView,
        },
      },
    });

    expect(loadVariableManagerBootstrapMock).toHaveBeenCalledWith(undefined, {
      silent: true,
    });

    wrapper.unmount();
  });
});
