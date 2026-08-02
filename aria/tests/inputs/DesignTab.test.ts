import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import type { BuilderNodeFixture } from "../helpers/builderNodeFixture";

const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
const selectionTreeRootNodesRef = ref<BuilderNodeFixture[]>([]);

const selectedNodeIdRef = ref<string | null>(null);

vi.mock("../../admin/features/Core", () => ({
  useSelectedNodeState: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    primarySelectedNode: selectedNodeRef,
    primarySelectedNodeId: selectedNodeIdRef,
    selectedNodes: ref([]),
    selectedNodeIds: ref([]),
    selectionAnchorNodeId: ref<string | null>(null),
    selectionCount: ref(0),
    isMultiSelect: ref(false),
    updateSelectedNodeClassNames: vi.fn(() => null),
    updateSelectedNodeCustomClasses: vi.fn(() => null),
    updateSelectedNodeProps: vi.fn(() => null),
    updateSelectedNodeStyles: vi.fn(() => null),
    updateSelectedNodeA11y: vi.fn(() => null),
    updateSelectedNodeMotion: vi.fn(() => null),
    updateSelectedNodeDataSource: vi.fn(() => null),
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
    setSelectionTreeRootNodes: (next: BuilderNodeFixture[]) => {
      selectionTreeRootNodesRef.value = next;
    },
  }),
  useCanvasSignalBridge: () => ({
    signalA11yUpdate: vi.fn(),
    signalMotionUpdate: vi.fn(),
    signalPropsUpdate: vi.fn(),
    broadcastPropsUpdate: vi.fn(),
    signalStyleUpdate: vi.fn(),
    broadcastClassUpdate: vi.fn(),
    signalSpacingPreviewStart: vi.fn(),
    signalSpacingPreviewEnd: vi.fn(),
    broadcastComponentWrapperResponse: vi.fn(),
  }),
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: ref("base"),
    isLoading: ref(false),
    error: ref<string | null>(null),
    saveProperty: vi.fn(),
    saveProperties: vi.fn(),
    saveNodeUpdates: vi.fn(),
    previewStyleProperties: vi.fn(),
    previewProps: vi.fn(),
    previewResponsiveStyleUpdates: vi.fn(),
    getComputedStyleValue: (
      _propertyName: string,
      fallback?: string,
    ) => fallback,
  }),
  useStageSignalBridge: () => ({
    signalAddBlock: vi.fn(),
  }),
  useInjectedPageBlocks: () => selectionTreeRootNodesRef,
  useInjectedStageIframeRef: () => ref<HTMLIFrameElement | null>(null),
}));

describe("DesignTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = {
      id: "button-1",
      type: "Button",
      props: {
        label: "Button",
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];
  });

  it("shows ButtonProperty for button nodes and hides generic link/content panels", async () => {
    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          ButtonProperty: defineComponent({
            props: {
              open: {
                type: Boolean,
                default: false,
              },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "button-property",
                  "data-open": String(props.open),
                });
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "link-property" });
            },
          }),
          TextProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "text-property" });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="button-property"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-testid="button-property"]').attributes("data-open"),
    ).toBe("true");
    expect(wrapper.find('[data-testid="link-property"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="text-property"]').exists()).toBe(false);
  });

  it("shows position, transform, and corner properties for selected nodes", async () => {
    selectedNodeRef.value = {
      id: "container-1",
      type: "Container",
      props: {},
      children: [],
    };

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PositionProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "position-property" });
            },
          }),
          TransformProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "transform-property" });
            },
          }),
          MotionProperty: true,
          CornerProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "corner-property" });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          LinkProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="position-property"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="transform-property"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="corner-property"]').exists()).toBe(true);
  });

  it("keeps the list property available for descendants of regular list nodes", async () => {
    selectionTreeRootNodesRef.value = [
      {
        id: "list-1",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "listitem",
            props: {},
            children: [
              {
                id: "text-1",
                type: "text",
                props: { text: "Item 1" },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    selectedNodeRef.value =
      selectionTreeRootNodesRef.value[0].children[0].children[0];

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          ListProperty: defineComponent({
            props: {
              targetNodeId: {
                type: String,
                default: null,
              },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "list-property",
                  "data-target-node-id": props.targetNodeId ?? "",
                });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          LinkProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="list-property"]').exists()).toBe(true);
    expect(
      wrapper
        .get('[data-testid="list-property"]')
        .attributes("data-target-node-id"),
    ).toBe("list-1");
  });

  it("targets the nearest regular list item for link editing", async () => {
    selectionTreeRootNodesRef.value = [
      {
        id: "list-1",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "listitem",
            props: {},
            children: [
              {
                id: "text-1",
                type: "text",
                props: { text: "Item 1" },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    selectedNodeRef.value =
      selectionTreeRootNodesRef.value[0].children[0].children[0];

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          ListProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "list-property" });
            },
          }),
          LinkProperty: defineComponent({
            props: {
              targetNodeId: {
                type: String,
                default: null,
              },
              showScopeControl: {
                type: Boolean,
                default: false,
              },
              defaultScope: {
                type: String,
                default: "",
              },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "link-property",
                  "data-target-node-id": props.targetNodeId ?? "",
                  "data-show-scope-control": String(props.showScopeControl),
                  "data-default-scope": props.defaultScope,
                });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(
      wrapper
        .get('[data-testid="link-property"]')
        .attributes("data-target-node-id"),
    ).toBe("item-1");
    expect(
      wrapper
        .get('[data-testid="link-property"]')
        .attributes("data-show-scope-control"),
    ).toBe("true");
    expect(
      wrapper
        .get('[data-testid="link-property"]')
        .attributes("data-default-scope"),
    ).toBe("text");
  });

  it("uses the dedicated icon list property for icon list descendants", async () => {
    selectionTreeRootNodesRef.value = [
      {
        id: "list-1",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "listitem",
            props: {},
            children: [
              {
                id: "icon-1",
                type: "icon",
                props: {},
                children: [],
              },
              {
                id: "text-1",
                type: "text",
                props: { text: "Item 1" },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    selectedNodeRef.value =
      selectionTreeRootNodesRef.value[0].children[0].children[1];

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          IconListProperty: defineComponent({
            props: {
              targetNodeId: {
                type: String,
                default: null,
              },
              open: {
                type: Boolean,
                default: false,
              },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "icon-list-property",
                  "data-target-node-id": props.targetNodeId ?? "",
                  "data-open": String(props.open),
                });
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "link-property" });
            },
          }),
          SizeProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "size-property" });
            },
          }),
          ListProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "list-property" });
            },
          }),
          IconProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "icon-property" });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          ComponentInstanceProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="icon-list-property"]').exists()).toBe(
      true,
    );
    expect(
      wrapper
        .get('[data-testid="icon-list-property"]')
        .attributes("data-target-node-id"),
    ).toBe("list-1");
    expect(wrapper.find('[data-testid="list-property"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="link-property"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="icon-property"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="size-property"]').exists()).toBe(false);
  });

  it.each([
    ["Container", "container-1"],
    ["Section", "section-1"],
    ["Card", "card-1"],
  ])("shows LinkProperty for %s nodes", async (type, id) => {
    selectedNodeRef.value = {
      id,
      type,
      props: {},
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "link-property" });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="link-property"]').exists()).toBe(true);
  });

  it("hides LinkProperty for navigation nodes", async () => {
    selectedNodeRef.value = {
      id: "nav-1",
      type: "Navigation",
      props: {},
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const DesignTab = (
      await import("../../admin/features/Inspector/tabs/DesignTab.vue")
    ).default;

    const wrapper = mount(DesignTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "link-property" });
            },
          }),
          NavigationProperty: defineComponent({
            setup() {
              return () => h("div", { "data-testid": "navigation-property" });
            },
          }),
          ClassesProperty: true,
          DisplayProperty: true,
          PositionProperty: true,
          TransformProperty: true,
          MotionProperty: true,
          CornerProperty: true,
          TypographyProperty: true,
          ImageProperty: true,
          ButtonProperty: true,
          CodeProperty: true,
          SvgProperty: true,
          IconProperty: true,
          IconListProperty: true,
          ListProperty: true,
          ComponentInstanceProperty: true,
          SizeProperty: true,
          SpacingProperty: true,
          BackgroundProperty: true,
          BorderProperty: true,
          ShadowProperty: true,
          FilterProperty: true,
          OpacityProperty: true,
          TextProperty: true,
          AttributesProperty: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="link-property"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="navigation-property"]').exists()).toBe(
      true,
    );
  });
});
