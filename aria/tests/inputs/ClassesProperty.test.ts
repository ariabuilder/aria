import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";

const selectedNodeRef = ref<Record<string, unknown> | null>(null);
const customClassesRef = ref<Record<string, Record<string, unknown>>>({});
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = computed(() =>
  activeClassNameRef.value
    ? (customClassesRef.value[activeClassNameRef.value] ?? null)
    : null,
);
const editingModeRef = ref<"element" | "class">("element");
const currentBreakpointRef = ref("base");
const selectedPseudoRef = ref("default");
const itemTypeRef = ref<"page" | "layout" | "component" | null>("page");
const itemSlugRef = ref("home");
const suggestionsRef = ref<Array<{ value: string; label: string }>>([]);
const utilityEngineRef = ref<"unocss" | "custom">("unocss");

const saveNodeUpdatesMock = vi.fn();
const loadClassesMock = vi.fn();
const createClassMock = vi.fn();
const deleteClassMock = vi.fn();
const renameClassMock = vi.fn();
const duplicateClassMock = vi.fn();
const copyClassStylesMock = vi.fn();
const replaceClassStylesMock = vi.fn();
const setActiveClassMock = vi.fn();
const clearActiveClassMock = vi.fn();
const addUtilityClassMock = vi.fn();
const removeUtilityClassMock = vi.fn();
const addCustomClassToNodeMock = vi.fn();
const removeCustomClassFromNodeMock = vi.fn();
const searchUnoMock = vi.fn();
const clearUnoSuggestionsMock = vi.fn();
const navigateToStudioMock = vi.fn();
const setDesignSectionMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  useCanvasSignalBridge: () => ({
    broadcastClassUpdate: vi.fn(),
  }),
  usePropertySave: () => ({
    saveNodeUpdates: saveNodeUpdatesMock,
  }),
  useSelectedNodeState: () => ({
    selectedNode: selectedNodeRef,
  }),
}));

vi.mock("../../admin/features/Inspector/composables", () => ({
  useClassEditor: () => ({
    customClasses: customClassesRef,
    activeClassName: activeClassNameRef,
    activeClass: activeClassRef,
    editingMode: editingModeRef,
    currentBreakpoint: currentBreakpointRef,
    isLoading: ref(false),
    error: ref(null),
    loadClasses: loadClassesMock,
    createClass: createClassMock,
    deleteClass: deleteClassMock,
    renameClass: renameClassMock,
    duplicateClass: duplicateClassMock,
    copyClassStyles: copyClassStylesMock,
    replaceClassStyles: replaceClassStylesMock,
    setActiveClass: setActiveClassMock,
    clearActiveClass: clearActiveClassMock,
    addUtilityClass: addUtilityClassMock,
    removeUtilityClass: removeUtilityClassMock,
    addCustomClassToNode: addCustomClassToNodeMock,
    removeCustomClassFromNode: removeCustomClassFromNodeMock,
    isCustomClass: (className: string) =>
      Boolean(customClassesRef.value[className]),
  }),
  useAutocomplete: () => ({
    suggestions: suggestionsRef,
    search: searchUnoMock,
    clear: clearUnoSuggestionsMock,
  }),
}));

vi.mock("../../admin/features/Core/composables/useAppRouter", () => ({
  useAppRouter: () => ({
    itemType: itemTypeRef,
    itemSlug: itemSlugRef,
    navigateToStudio: navigateToStudioMock,
  }),
}));

vi.mock("../../admin/features/Design/composables/useDesignSection", () => ({
  useDesignSection: () => ({
    setDesignSection: setDesignSectionMock,
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useInspectorState", () => ({
  useInspectorState: () => ({
    selectedPseudo: selectedPseudoRef,
  }),
}));

vi.mock("../../admin/features/Design/composables/useUtilityParser", () => ({
  useUtilityParser: () => ({
    isValidUtility: () => false,
    isLikelyUtilityClass: () => false,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../../admin/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    utilityEngine: utilityEngineRef,
  }),
}));

vi.mock("@/components/ui/tooltip", () => {
  const { defineComponent, h } = require("vue");

  return {
    TooltipProvider: defineComponent({
      setup(_: unknown, { slots }: { slots: { default?: () => unknown } }) {
        return () => h("div", slots.default?.());
      },
    }),
    Tooltip: defineComponent({
      setup(_: unknown, { slots }: { slots: { default?: () => unknown } }) {
        return () => h("div", slots.default?.());
      },
    }),
    TooltipTrigger: defineComponent({
      setup(_: unknown, { slots }: { slots: { default?: () => unknown } }) {
        return () => h("div", slots.default?.());
      },
    }),
    TooltipContent: defineComponent({
      setup(_: unknown, { slots }: { slots: { default?: () => unknown } }) {
        return () => h("div", slots.default?.());
      },
    }),
  };
});

const LONG_UTILITY_CLASS =
  "bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),#ffffff)]";

const LONG_CUSTOM_CLASS =
  "this-is-an-intentionally-very-long-custom-class-name-for-testing";

function createMountStubs() {
  return {
    BaseProperty: defineComponent({
      props: {
        title: {
          type: String,
          required: true,
        },
      },
      setup(props, { slots }) {
        return () =>
          h("section", [
            h("header", { "data-testid": "classes-property-header" }, [
              h(
                "div",
                { "data-testid": "classes-property-header-title" },
                slots["header-title"]?.() ?? props.title,
              ),
              h(
                "div",
                { "data-testid": "classes-property-header-actions" },
                slots["header-actions"]?.(),
              ),
            ]),
            h("div", slots.default?.()),
          ]);
      },
    }),
    Button: defineComponent({
      setup(_, { attrs, slots }) {
        return () => h("button", attrs, slots.default?.());
      },
    }),
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
    PopoverTrigger: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    PopoverContent: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    ContextMenu: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    ContextMenuTrigger: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    ContextMenuContent: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    ContextMenuItem: defineComponent({
      emits: ["select"],
      setup(_, { attrs, slots, emit }) {
        return () =>
          h(
            "button",
            {
              ...attrs,
              onClick: () => emit("select"),
            },
            slots.default?.(),
          );
      },
    }),
    ContextMenuSeparator: defineComponent({
      setup() {
        return () => h("div");
      },
    }),
    Dialog: defineComponent({
      props: {
        open: {
          type: Boolean,
          default: false,
        },
      },
      setup(props, { slots }) {
        return () =>
          props.open
            ? h("div", { "data-testid": "class-dialog" }, slots.default?.())
            : null;
      },
    }),
    DialogContent: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    DialogHeader: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    DialogTitle: defineComponent({
      setup(_, { slots }) {
        return () => h("h2", slots.default?.());
      },
    }),
    DialogDescription: defineComponent({
      setup(_, { slots }) {
        return () => h("p", slots.default?.());
      },
    }),
    DialogFooter: defineComponent({
      setup(_, { slots }) {
        return () => h("footer", slots.default?.());
      },
    }),
  };
}

async function mountClassesProperty() {
  const ClassesProperty = (
    await import("../../admin/features/Inspector/inputs/ClassesProperty.vue")
  ).default;

  return mount(ClassesProperty, {
    props: {
      mode: "composer",
    },
    global: {
      stubs: createMountStubs(),
    },
  });
}

function findClassChip(
  wrapper: Awaited<ReturnType<typeof mountClassesProperty>>,
  text: string,
) {
  return wrapper
    .findAll(".class-tag-chip")
    .find((node) => node.text().includes(text));
}

describe("ClassesProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: [],
      props: {},
    };
    customClassesRef.value = {
      "background-blue": {
        id: "background-blue",
        name: "background-blue",
        variants: [
          {
            breakpoint: "base",
            rules: [{ property: "background-color", value: "blue" }],
          },
        ],
        pseudoVariants: [],
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "test-class__container": {
        id: "test-class__container",
        name: "test-class__container",
        variants: [
          {
            breakpoint: "base",
            rules: [{ property: "color", value: "white" }],
          },
        ],
        pseudoVariants: [],
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    activeClassNameRef.value = "test-class__container";
    editingModeRef.value = "class";
    currentBreakpointRef.value = "base";
    selectedPseudoRef.value = "default";
    itemTypeRef.value = "page";
    itemSlugRef.value = "home";
    utilityEngineRef.value = "unocss";
    suggestionsRef.value = [];
    loadClassesMock.mockResolvedValue(undefined);
    addCustomClassToNodeMock.mockResolvedValue(true);
    replaceClassStylesMock.mockResolvedValue(true);
  });

  it("renders the default Classes header without class-editing actions", async () => {
    activeClassNameRef.value = null;
    editingModeRef.value = "element";

    const wrapper = await mountClassesProperty();
    await flushPromises();

    expect(wrapper.get('[data-testid="classes-header-title"]').text()).toBe(
      "Classes",
    );
    expect(
      wrapper.find('[aria-label="Copy styles from active class"]').exists(),
    ).toBe(false);
    expect(wrapper.find('[aria-label="Rename class"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[aria-label="Done editing class"]').exists()).toBe(
      false,
    );

    wrapper.unmount();
  });

  it("moves active class editing state and actions into the header", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: ["test-class__container"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    expect(wrapper.get('[data-testid="classes-header-title"]').text()).toBe(
      ".test-class__container",
    );
    expect(wrapper.text()).not.toContain("Editing .test-class__container");
    expect(
      wrapper.find('[aria-label="Copy styles from active class"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[aria-label="Rename class"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[aria-label="Done editing class"]').exists()).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("keeps header actions and adds shortcut menus only to custom class chips", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: ["px-6"] },
      customClasses: ["background-blue", "test-class__container"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    expect(
      wrapper.find('[aria-label="Copy styles from active class"]').exists(),
    ).toBe(true);

    const customChip = findClassChip(wrapper, "background-blue");
    const utilityChip = findClassChip(wrapper, "px-6");

    expect(customChip).toBeDefined();
    expect(utilityChip).toBeDefined();

    await customChip!.trigger("contextmenu");
    expect(setActiveClassMock).toHaveBeenCalledWith("background-blue");

    expect(wrapper.text()).toContain("Copy styles");
    expect(wrapper.text()).toContain("Edit CSS");
    expect(wrapper.text()).toContain("Rename class");
    expect(wrapper.text()).toContain("Duplicate class");
    expect(wrapper.text()).toContain("Remove class");
    expect(
      wrapper
        .findAll("button")
        .filter((button) => button.text().includes("Copy styles")),
    ).toHaveLength(2);

    await utilityChip!.trigger("contextmenu");
    expect(setActiveClassMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("copies and pastes styles through the custom class shortcut menu", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: ["background-blue", "test-class__container"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const copyAction = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Copy styles"));

    expect(copyAction).toBeDefined();
    await copyAction!.trigger("click");
    await nextTick();

    const pasteAction = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Paste copied styles"));

    expect(pasteAction).toBeDefined();
    await pasteAction!.trigger("click");
    await flushPromises();

    expect(replaceClassStylesMock).toHaveBeenCalledWith(
      "test-class__container",
      [
        {
          breakpoint: "base",
          rules: [{ property: "background-color", value: "blue" }],
        },
      ],
      [],
    );

    wrapper.unmount();
  });

  it("copies styles into an in-app clipboard and pastes into another active class", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: ["test-class__container", "background-blue"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    expect(
      wrapper.find('[aria-label="Paste copied styles"]').exists(),
    ).toBe(false);

    await wrapper
      .get('[aria-label="Copy styles from active class"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("Copy Class Styles");
    expect(
      wrapper.find('[aria-label="Paste copied styles"]').exists(),
    ).toBe(false);

    activeClassNameRef.value = "background-blue";
    await nextTick();

    const pasteButton = wrapper.get('[aria-label="Paste copied styles"]');

    expect(pasteButton.attributes("title")).toBe(
      "Paste styles from .test-class__container",
    );

    await pasteButton.trigger("click");
    await flushPromises();

    expect(replaceClassStylesMock).toHaveBeenCalledWith(
      "background-blue",
      [
        {
          breakpoint: "base",
          rules: [{ property: "color", value: "white" }],
        },
      ],
      [],
    );
    expect(copyClassStylesMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("opens rename and exits class editing from header actions", async () => {
    const wrapper = await mountClassesProperty();
    await flushPromises();

    await wrapper.get('[aria-label="Rename class"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Rename class");

    await wrapper.get('[aria-label="Done editing class"]').trigger("click");
    await flushPromises();

    expect(clearActiveClassMock).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("shows merged base and breakpoint classes at md", async () => {
    currentBreakpointRef.value = "md";
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: ["px-6", "py-40"], md: ["flex-col"] },
      customClasses: [],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const chips = wrapper.findAll(".class-tag-chip");
    const chipLabels = chips.map((chip) => chip.text());

    expect(chipLabels.some((text) => text.includes("px-6"))).toBe(true);
    expect(chipLabels.some((text) => text.includes("py-40"))).toBe(true);
    expect(chipLabels.some((text) => text.includes("flex-col"))).toBe(true);

    wrapper.unmount();
  });

  it("activates a custom class when selected from the dropdown", async () => {
    const wrapper = await mountClassesProperty();

    await flushPromises();

    const input = wrapper.find("input");
    await input.setValue("background-blue");
    await flushPromises();

    const customClassButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("background-blue"));

    expect(customClassButton).toBeDefined();

    await customClassButton!.trigger("click");
    await flushPromises();

    expect(addCustomClassToNodeMock).toHaveBeenCalledWith(
      "pages",
      "home",
      "node-1",
      "background-blue",
    );
    expect(setActiveClassMock).toHaveBeenCalledWith("background-blue");

    wrapper.unmount();
  });

  it("hides utility categories when UnoCSS is disabled", async () => {
    utilityEngineRef.value = "custom";

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const input = wrapper.find("input");
    await input.trigger("focus");
    await flushPromises();

    expect(wrapper.text()).toContain("background-blue");
    expect(wrapper.text()).not.toContain("Utilities");

    wrapper.unmount();
  });

  it("truncates long utility classes and expands on chevron click", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [LONG_UTILITY_CLASS, "px-6"] },
      customClasses: [],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const longChip = findClassChip(wrapper, "linear-gradient");

    expect(longChip).toBeDefined();
    expect(longChip!.find("span.truncate").exists()).toBe(true);
    expect(longChip!.find('[aria-label="Expand class"]').exists()).toBe(true);

    const shortChip = findClassChip(wrapper, "px-6");

    expect(shortChip).toBeDefined();
    expect(shortChip!.find('[aria-label="Expand class"]').exists()).toBe(false);

    await longChip!.find('[aria-label="Expand class"]').trigger("click");
    await flushPromises();

    expect(longChip!.find("span.break-all").exists()).toBe(true);
    expect(longChip!.find('[aria-label="Collapse class"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("toggles active custom class when clicking a custom chip on the node", async () => {
    activeClassNameRef.value = null;
    editingModeRef.value = "element";
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: ["background-blue"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const customChip = findClassChip(wrapper, "background-blue");

    expect(customChip).toBeDefined();
    expect(customChip!.find('[aria-label="Expand class"]').exists()).toBe(
      false,
    );

    await customChip!.trigger("click");
    expect(setActiveClassMock).toHaveBeenCalledWith("background-blue");

    activeClassNameRef.value = "background-blue";
    await customChip!.trigger("click");
    expect(clearActiveClassMock).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("does not show expand chevron for long custom class names", async () => {
    customClassesRef.value = {
      ...customClassesRef.value,
      [LONG_CUSTOM_CLASS]: {
        id: LONG_CUSTOM_CLASS,
        name: LONG_CUSTOM_CLASS,
        variants: [],
        pseudoVariants: [],
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: [LONG_CUSTOM_CLASS],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const customChip = findClassChip(wrapper, LONG_CUSTOM_CLASS);

    expect(customChip).toBeDefined();
    expect(customChip!.find('[aria-label="Expand class"]').exists()).toBe(
      false,
    );
    expect(customChip!.find("span.truncate").exists()).toBe(false);

    wrapper.unmount();
  });

  it("removes custom classes via removeCustomClassFromNode", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      classNames: { base: [] },
      customClasses: ["background-blue"],
      props: {},
    };

    const wrapper = await mountClassesProperty();
    await flushPromises();

    const customChip = findClassChip(wrapper, "background-blue");

    expect(customChip).toBeDefined();

    await customChip!.find('[aria-label="Remove class"]').trigger("click");
    await flushPromises();

    expect(removeCustomClassFromNodeMock).toHaveBeenCalledWith(
      "pages",
      "home",
      "node-1",
      "background-blue",
    );
    expect(removeUtilityClassMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
