import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

import LoopQueryFields from "../../../admin/features/Inspector/components/LoopQueryFields.vue";
import PropsTab from "../../../admin/features/Inspector/tabs/PropsTab.vue";
import {
  isLoopSourceProp,
  shouldHideLoopSourceProp,
  shouldShowInheritedLoopBanner,
  shouldShowLoopSourceSection,
} from "../../../admin/features/Inspector/lib/loopInspectorVisibility";

const usePropsEditorMock = vi.hoisted(() => vi.fn());

vi.mock("../../../admin/features/Inspector/composables/usePropsEditor", () => ({
  usePropsEditor: usePropsEditorMock,
}));

vi.mock("../../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: ref({
      id: "loop-1",
      type: "container",
      props: {},
      styles: {},
      children: [],
    }),
  }),
  useSelectionTreeState: () => ({
    selectedNode: ref(null),
    selectedNodeId: ref("loop-1"),
  }),
}));

function createPropsEditorStub() {
  return {
    cmsListLimit: ref(12),
    cmsListSort: ref("-publishedAt"),
    cmsListStatus: ref(""),
    cmsListOffset: ref(0),
    cmsListLocale: ref(""),
    cmsLocaleOptions: ref(["en", "fr"]),
    selectedCollection: ref({ id: "blog", name: "blog" }),
    selectedCollectionName: ref("blog"),
    updateCmsListLimit: vi.fn(),
    updateCmsListSort: vi.fn(),
    updateCmsListStatus: vi.fn(),
    updateCmsListOffset: vi.fn(),
    updateCmsListLocale: vi.fn(),
    elementContext: ref({
      node: {
        id: "loop-1",
        type: "container",
        props: {},
        styles: {},
        children: [],
      },
      nodeId: "loop-1",
      nodeType: "Container",
      displayName: "Container",
      capabilities: { isComponentInstance: false },
      canEdit: true,
      componentRef: null,
    }),
    isSelectedNodeRepeatCapable: ref(true),
    hasInheritedCmsLoopSource: ref(false),
    collections: ref([{ id: "blog", name: "blog", label: "Blog" }]),
    isAssignedCmsTemplatePage: ref(false),
    isLoadingCollections: ref(false),
    pageAssignedCollection: ref(null),
    cmsBindings: ref({ items: "blog" }),
    isPropCmsBound: vi.fn(() => true),
    propBindingMode: vi.fn(() => "dynamic" as const),
    cmsDataSourceMode: ref("list"),
    hasProperties: ref(true),
    propertyCount: ref(0),
    properties: ref([]),
    nodeBindingSummary: ref({ label: "Blog" }),
    collectionsError: ref(null),
    cmsEntriesError: ref(null),
    cmsSourceError: ref(null),
    componentSchemaError: ref(null),
    componentRef: ref(null),
    isLoadingComponentSchema: ref(false),
    isEntryTemplatePage: ref(false),
    isListTemplatePage: ref(false),
    cmsFieldOptions: ref([]),
    cmsFieldOptionGroupsForProp: vi.fn(() => []),
    cmsBindingDisplayForProp: vi.fn(() => null),
    isDateBoundProp: vi.fn(() => false),
    dateFormatForProp: vi.fn(() => ""),
    updateProp: vi.fn(),
    bindPropToCmsField: vi.fn(),
    unbindPropFromCms: vi.fn(),
    updateCmsCollection: vi.fn(),
    updateCmsDataSourceMode: vi.fn(),
    updateCmsSingleEntry: vi.fn(),
    setPropBindingMode: vi.fn(),
    setStudioEditable: vi.fn(),
    setStudioHidden: vi.fn(),
    setContentEditorExposure: vi.fn(),
    setPropDateFormat: vi.fn(),
    addProp: vi.fn(),
    selectedCmsEntryId: ref(""),
    updateCmsLoopCollection: vi.fn(),
    loadCmsCollections: vi.fn(),
  };
}

describe("loopInspectorVisibility", () => {
  it("identifies loop source props", () => {
    expect(isLoopSourceProp({ name: "items", type: "array" })).toBe(true);
    expect(isLoopSourceProp({ name: "title", type: "string" })).toBe(false);
  });

  it("shows loop source section for repeat-capable roots", () => {
    expect(
      shouldShowLoopSourceSection({
        isRepeatCapable: true,
        hasInheritedLoop: false,
      }),
    ).toBe(true);
    expect(
      shouldShowLoopSourceSection({
        isRepeatCapable: true,
        hasInheritedLoop: true,
      }),
    ).toBe(false);
  });

  it("shows inherited loop banner for nested repeat-capable nodes", () => {
    expect(
      shouldShowInheritedLoopBanner({
        isRepeatCapable: true,
        hasInheritedLoop: true,
      }),
    ).toBe(true);
    expect(
      shouldShowInheritedLoopBanner({
        isRepeatCapable: true,
        hasInheritedLoop: false,
      }),
    ).toBe(false);
  });

  it("hides items prop when loop source section is shown", () => {
    expect(
      shouldHideLoopSourceProp(
        { name: "items", type: "array" },
        true,
      ),
    ).toBe(true);
    expect(
      shouldHideLoopSourceProp(
        { name: "items", type: "array" },
        false,
      ),
    ).toBe(false);
    expect(
      shouldHideLoopSourceProp(
        { name: "title", type: "string" },
        true,
      ),
    ).toBe(false);
  });
});

describe("LoopQueryFields", () => {
  it("renders aligned Kumo rows for loop query controls", () => {
    usePropsEditorMock.mockReturnValue(createPropsEditorStub());

    const wrapper = mount(LoopQueryFields, {
      global: {
        stubs: {
          Select: {
            template:
              '<div class="select-stub"><slot /><slot name="content" /></div>',
          },
          SelectTrigger: { template: '<button><slot /></button>' },
          SelectValue: { template: "<span />" },
          SelectContent: { template: '<div><slot /></div>' },
          SelectItem: { template: '<div><slot /></div>' },
          Input: {
            props: ["modelValue"],
            template:
              '<input :value="modelValue" @input="$emit(\'change\', $event)" />',
          },
        },
      },
    });

    const labels = wrapper
      .findAll("label")
      .map((label) => label.text().trim());

    expect(labels).toEqual(["Entries", "Sort", "Status", "Offset", "Locale"]);
    expect(wrapper.find('[data-testid="loop-query-fields"]').exists()).toBe(
      true,
    );
    expect(wrapper.findAll(".grid.grid-cols-\\[72px_minmax\\(0\\,1fr\\)\\]")).toHaveLength(
      5,
    );

    wrapper.unmount();
  });
});

describe("PropsTab loop link", () => {
  it("renders embedded LinkProperty in the loop section", () => {
    usePropsEditorMock.mockReturnValue(createPropsEditorStub());

    const wrapper = mount(PropsTab, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          ScrollArea: { template: "<div><slot /></div>" },
          PaginationInspectorSection: true,
          LoopQueryFields: true,
          LoopArchiveFilterFields: true,
          LinkProperty: {
            props: ["embedded", "targetNodeId"],
            template:
              '<div data-testid="embedded-link-property" :data-embedded="embedded" :data-target-node-id="targetNodeId" />',
          },
          Select: {
            template:
              '<div class="select-stub"><slot /><slot name="content" /></div>',
          },
          SelectTrigger: { template: "<button><slot /></button>" },
          SelectValue: { template: "<span />" },
          SelectContent: { template: "<div><slot /></div>" },
          SelectItem: { template: "<div><slot /></div>" },
          Button: { template: "<button><slot /></button>" },
          Input: true,
          InspectorPropBinding: true,
          InspectorDateFormatSelect: true,
          CmsEntryCommandSelect: true,
        },
      },
    });

    const loopLink = wrapper.find('[data-testid="loop-item-link"]');
    expect(loopLink.exists()).toBe(true);
    expect(loopLink.find('[data-testid="embedded-link-property"]').exists()).toBe(
      true,
    );
    expect(loopLink.text()).toContain("Wrap each looped item in a link.");

    wrapper.unmount();
  });
});
