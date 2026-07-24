import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createInspectorPropertySaveMock,
  inspectorPropertyState,
} from "./helpers/inspectorPropertyTestState";

const selectedNodeRef = inspectorPropertyState.selectedNodeRef;
const selectedNodeIdRef = inspectorPropertyState.selectedNodeIdRef;
const breakpointNameRef = inspectorPropertyState.breakpointNameRef;
const isLoadingRef = inspectorPropertyState.isLoadingRef;
const errorRef = inspectorPropertyState.errorRef;
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = ref<Record<string, unknown> | null>(null);
const savePropertyMock = vi.fn();
const setClassRuleMock = vi.fn();
const previewClassRulesMock = vi.fn(() => true);
const removeClassRuleMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: createInspectorPropertySaveMock({
    saveProperty: savePropertyMock,
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useInspectorState", () => ({
  useInspectorState: () => ({
    selectedPseudo: ref("default"),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useClassEditor", () => ({
  useClassEditor: () => ({
    editingMode: editingModeRef,
    activeClassName: activeClassNameRef,
    activeClass: activeClassRef,
    isLoading: classEditorLoadingRef,
    error: classEditorErrorRef,
    setClassRule: setClassRuleMock,
    removeClassRule: removeClassRuleMock,
    previewClassRules: previewClassRulesMock,
    getClassRule: vi.fn(() => undefined),
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([
      { name: "base", label: "Base", minWidth: 0 },
      { name: "tablet", label: "Tablet", minWidth: 768 },
      { name: "desktop", label: "Desktop", minWidth: 1280 },
    ]),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      display: { base: "block" },
      visibility: { base: "visible" },
      opacity: { base: "1" },
    })),
  }),
}));

describe("VisibilityProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = null;
    selectedNodeIdRef.value = null;
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    classEditorLoadingRef.value = false;
    classEditorErrorRef.value = null;
    editingModeRef.value = "element";
    activeClassNameRef.value = null;
    activeClassRef.value = null;
    savePropertyMock.mockResolvedValue(true);
    setClassRuleMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
  });

  it("rehydrates from the active class and toggles visibility as a class rule", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: { base: "block" },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    activeClassNameRef.value = "class-1";
    activeClassRef.value = {
      id: "class-1",
      name: "class-1",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "display", value: "none", important: false }],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const VisibilityProperty = (
      await import(
        "../../admin/features/Inspector/inputs/VisibilityProperty.vue" as any
      )
    ).default;

    const wrapper = mount(VisibilityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              statusIcon: { type: String, default: "" },
            },
            emits: ["header-click"],
            setup(props, { attrs, emit }) {
              return () =>
                h(
                  "button",
                  {
                    ...attrs,
                    type: "button",
                    "data-testid": "visibility-toggle",
                    "data-status-icon": props.statusIcon,
                    onClick: () => emit("header-click"),
                  },
                  "toggle",
                );
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="visibility-toggle"]')
        .attributes("data-status-icon"),
    ).toContain("view-off");

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "display", value: "block", important: false }],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await nextTick();
    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="visibility-toggle"]')
        .attributes("data-status-icon"),
    ).toContain("eye");

    await wrapper.get('[data-testid="visibility-toggle"]').trigger("click");

    expect(setClassRuleMock).toHaveBeenCalledWith("display", "none");

    wrapper.unmount();
  });
});
