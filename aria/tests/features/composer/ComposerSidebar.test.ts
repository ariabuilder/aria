import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";

const mockAgentRuntime = vi.hoisted(() => ({
  isWorking: { value: false },
  activeRunCount: { value: 0 },
  isBuilding: { value: false },
  currentBuild: { value: null },
  currentBuildSequence: { value: 0 },
  completedSectionCount: { value: 0 },
}));

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
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
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

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverAnchor: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/features/Stage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/Stage")>();
  return {
    ...actual,
    usePreview: () => ({
      isPreview: { value: false },
      togglePreview: vi.fn(),
    }),
  };
});

vi.mock("@/features/Core", () => ({
  useShellSignalBridge: () => ({
    onOpenAddElements: vi.fn(),
  }),
}));

vi.mock("@/features/Design", () => ({
  useTheme: () => ({
    isDark: { value: false },
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/features/Layers", () => ({
  LayerPanel: defineComponent({
    name: "LayerPanel",
    setup() {
      return () => h("div", { "data-testid": "layer-panel" });
    },
  }),
}));

vi.mock("@/features/Blocks", () => ({
  BlockLibrary: defineComponent({
    name: "BlockLibrary",
    setup() {
      return () => h("div", { "data-testid": "block-library" });
    },
  }),
}));

vi.mock("@/features/Agent", () => ({
  AgentChatView: defineComponent({
    name: "AgentChatView",
    setup() {
      return () => h("div", { "data-testid": "agent-chat" });
    },
  }),
  useAgentPanel: () => ({
    isOpen: ref(false),
    open: vi.fn(),
    close: vi.fn(),
  }),
  useAgentRuntimeStatus: () => ({
    ...mockAgentRuntime,
  }),
}));

vi.mock("@/features/Studio/core/components/ExpandableSearchInput.vue", () => ({
  default: defineComponent({
    name: "ExpandableSearchInput",
    setup() {
      return () => h("div", { "data-testid": "expandable-search" });
    },
  }),
}));

vi.mock("@/features/Composer/components/ComposerCanvasOptionsMenu.vue", () => ({
  default: defineComponent({
    name: "ComposerCanvasOptionsMenu",
    setup() {
      return () => h("div", { "data-testid": "canvas-options-menu" });
    },
  }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverAnchor: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/command", () => ({
  Command: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CommandGroup: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CommandItem: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CommandList: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock(
  "@/features/Composer/composables/useComposerSavePublishUiState",
  () => ({
    useComposerSavePublishUiState: () => ({
      isPublished: { value: false },
      livePageHref: { value: null },
    }),
  }),
);

vi.mock("@/features/Composer/components/ComponentSettingsPanel.vue", () => ({
  default: defineComponent({
    name: "ComponentSettingsPanel",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("@/features/Composer/components/ComposerQuickSwitch.vue", () => ({
  default: defineComponent({
    name: "ComposerQuickSwitch",
    setup() {
      return () => h("div", { "data-testid": "quick-switch" });
    },
  }),
}));

const pageEditingProps = {
  currentItemSlug: "home",
  currentItemType: "page" as const,
  currentPage: {
    id: "page-1",
    slug: "home",
    title: "Home",
    status: "draft" as const,
    layout: "default",
    nodes: [],
  },
  hasUnsavedChanges: true,
};

const mountOptions = {
  global: {
    stubs: {
      Transition: false,
    },
  },
};

describe("ComposerSidebar layout", () => {
  beforeEach(() => {
    mockAgentRuntime.isWorking.value = false;
    mockAgentRuntime.activeRunCount.value = 0;
    mockAgentRuntime.isBuilding.value = false;
    mockAgentRuntime.currentBuild.value = null;
    mockAgentRuntime.currentBuildSequence.value = 0;
    mockAgentRuntime.completedSectionCount.value = 0;
  });

  it("uses unified panel headers and omits viewport control from sidebar", async () => {
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });

    const panelHeaders = wrapper.findAll(".border-dashed.h-10");
    expect(panelHeaders.length).toBeGreaterThanOrEqual(2);
    expect(wrapper.text()).not.toContain("Viewport");
    expect(wrapper.find(".bg-sidebar\\/30").exists()).toBe(false);
  });

  it("omits save and publish controls from sidebar chrome", async () => {
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });

    expect(wrapper.find(".i-hugeicons\\:play").exists()).toBe(false);
    expect(wrapper.find(".i-hugeicons\\:pause").exists()).toBe(false);
    expect(wrapper.find(".i-hugeicons\\:floppy-disk").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Unsaved changes");
    expect(wrapper.text()).not.toContain("Up to date");
    expect(wrapper.find(".border-t.border-dashed.border-border").exists()).toBe(
      false,
    );
  });

  it("keeps the layer toolbar visibly busy during global expansion", async () => {
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });
    const layerPanel = wrapper.getComponent({ name: "LayerPanel" });

    layerPanel.vm.$emit("update:layersBusy", true);
    layerPanel.vm.$emit("update:layersOperation", "expanding");
    await nextTick();

    const button = wrapper.get('button[aria-label="Expanding all layers"]');
    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.attributes()).toHaveProperty("disabled");
    expect(
      button
        .findAll("div")
        .some((node) => node.classes().includes("i-hugeicons:loading-01")),
    ).toBe(true);
  });

  it("replaces the Components workspace with AI Engineer", async () => {
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });

    await wrapper.get('[data-testid="composer-agent-tab"]').trigger("click");

    expect(wrapper.find('[data-testid="agent-chat"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Aria Engineer");
  });

  it("keeps the agent mounted while switching back to Layers", async () => {
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });

    const chat = wrapper.find('[data-testid="agent-chat"]');
    expect(chat.exists()).toBe(true);
    expect(chat.attributes("style")).toContain("display: none");

    await wrapper.get('[data-testid="composer-agent-tab"]').trigger("click");
    expect(
      wrapper.find('[data-testid="agent-chat"]').attributes("style") ?? "",
    ).not.toContain("display: none");

    await wrapper.get('[data-testid="composer-layers-tab"]').trigger("click");
    expect(wrapper.find('[data-testid="agent-chat"]').exists()).toBe(true);
  });

  it("shows completed section progress while the agent works in the background", async () => {
    mockAgentRuntime.isWorking.value = true;
    mockAgentRuntime.isBuilding.value = true;
    mockAgentRuntime.completedSectionCount.value = 3;
    const { default: ComposerSidebar } =
      await import("@/features/Composer/components/ComposerSidebar.vue");

    const wrapper = mount(ComposerSidebar, {
      ...mountOptions,
      props: pageEditingProps,
    });

    expect(
      wrapper.get('[data-testid="composer-agent-build-count"]').text(),
    ).toBe("3");
  });
});
