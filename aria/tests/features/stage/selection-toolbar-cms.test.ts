import { describe, expect, it, vi, beforeEach } from "vitest";
import { computed, ref } from "vue";

import {
  findImagePropDefinition,
  findLinkPropDefinition,
  resolveCmsQuickPickerInitialPage,
  resolveImagePropName,
  resolveLinkPropName,
  shouldShowToolbarImageButton,
  shouldShowToolbarLinkButton,
  shouldShowToolbarLoopButton,
  shouldShowToolbarTextButton,
  useSelectionToolbarCms,
} from "../../../admin/features/Stage/composables/useSelectionToolbarCms";
import type {
  CmsBindingFieldOptionGroup,
  PropertyDefinition,
} from "../../../admin/features/Inspector/composables/usePropsEditor";
import type { BuilderNode } from "../../../lib/types/nodes";

const setTab = vi.fn();
const getNodeTarget = vi.fn<
  () => {
    path: { collection: "pages"; id: string };
    nodeId: string;
  } | null
>(() => ({
  path: { collection: "pages" as const, id: "home" },
  nodeId: "parent",
}));
const getDocumentPath = vi.fn(() => ({
  collection: "pages" as const,
  id: "home",
}));
const bindPropToCmsField = vi.fn(async () => ({ success: true }));
const setPropBindingMode = vi.fn(async () => ({ success: true }));
const unbindPropFromCms = vi.fn(async () => ({ success: true }));
const ensureTemplatePageListDataSource = vi.fn(async () => ({ success: true }));
const ensureTemplatePageDataSource = vi.fn(async () => ({ success: true }));
const updateCmsCollection = vi.fn(async () => ({ success: true }));
const updateCmsLoopCollection = vi.fn(async () => ({ success: true }));
const updateCmsSingleEntry = vi.fn(async () => ({ success: true }));
const cmsFieldOptionGroupsForProp = vi.fn<
  (prop: PropertyDefinition) => CmsBindingFieldOptionGroup[]
>(() => []);
const cmsBindingDisplayForProp = vi.fn(() => null);
const batchUpdate = vi.fn(async () => ({ success: true }));
const selectedNodeRef = ref<BuilderNode | null>(null);
const nodesById = new Map<string, BuilderNode>();
const resolveNode = vi.fn((nodeId: string) => nodesById.get(nodeId) ?? null);

function makeProperty(
  input: Pick<PropertyDefinition, "name" | "type"> &
    Partial<Omit<PropertyDefinition, "name" | "type">>,
): PropertyDefinition {
  return {
    value: "",
    isRequired: false,
    studioEditable: true,
    studioHidden: false,
    contentEditorEligible: false,
    contentEditorEnabled: false,
    contentEditorLocked: false,
    contentEditorHidden: false,
    hasSchemaField: false,
    ...input,
  };
}

const mockState = {
  properties: ref<PropertyDefinition[]>([]),
  collections: ref([{ name: "blog", label: "Blog" }]),
  cmsBindings: ref<Record<string, string>>({}),
  cmsDataSourceMode: ref<"single" | "list">("single"),
  isSelectedNodeRepeatCapable: ref(false),
  hasInheritedCmsLoopSource: ref(false),
  isAssignedCmsTemplatePage: ref(false),
  isListTemplatePage: ref(false),
  isEntryTemplatePage: ref(false),
  selectedCollection: ref({ name: "blog", label: "Blog" }),
  pageAssignedCollection: ref(null as { name: string; label: string } | null),
  collectionsError: ref<string | null>(null),
  cmsEntriesError: ref<string | null>(null),
  cmsSourceError: ref<string | null>(null),
  isLoadingCollections: ref(false),
  isLoadingCmsEntries: ref(false),
  selectedCollectionName: ref("blog"),
  selectedCmsEntryId: ref(""),
  cmsEntryOptions: ref([
    { id: "entry-1", title: "Entry 1", slug: "entry-1", status: "draft" },
  ]),
};

vi.mock("../../../admin/features/Inspector/composables/useInspector", () => ({
  useInspector: () => ({
    getNodeTarget,
    getDocumentPath,
    setTab,
  }),
}));

vi.mock(
  "../../../admin/features/Core/composables/useSelectedNodeState",
  () => ({
    useSelectedNodeState: () => ({
      resolveNode,
      selectedNode: computed(() => selectedNodeRef.value),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useNodeMutations",
  () => ({
    useNodeMutations: () => ({
      batchUpdate,
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/usePropsEditor",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../../admin/features/Inspector/composables/usePropsEditor")
    >("../../../admin/features/Inspector/composables/usePropsEditor");

    return {
      ...actual,
      usePropsEditor: () => ({
        properties: computed(() => mockState.properties.value),
        collections: computed(() => mockState.collections.value),
        collectionsError: computed(() => mockState.collectionsError.value),
        cmsBindings: computed(() => mockState.cmsBindings.value),
        cmsDataSourceMode: computed(() => mockState.cmsDataSourceMode.value),
        cmsEntriesError: computed(() => mockState.cmsEntriesError.value),
        cmsEntryOptions: computed(() => mockState.cmsEntryOptions.value),
        cmsSourceError: computed(() => mockState.cmsSourceError.value),
        isLoadingCollections: computed(
          () => mockState.isLoadingCollections.value,
        ),
        isLoadingCmsEntries: computed(
          () => mockState.isLoadingCmsEntries.value,
        ),
        isSelectedNodeRepeatCapable: computed(
          () => mockState.isSelectedNodeRepeatCapable.value,
        ),
        hasInheritedCmsLoopSource: computed(
          () => mockState.hasInheritedCmsLoopSource.value,
        ),
        isAssignedCmsTemplatePage: computed(
          () => mockState.isAssignedCmsTemplatePage.value,
        ),
        isListTemplatePage: computed(() => mockState.isListTemplatePage.value),
        isEntryTemplatePage: computed(
          () => mockState.isEntryTemplatePage.value,
        ),
        selectedCollection: computed(() => mockState.selectedCollection.value),
        selectedCollectionName: computed(
          () => mockState.selectedCollectionName.value,
        ),
        selectedCmsEntryId: computed(() => mockState.selectedCmsEntryId.value),
        pageAssignedCollection: computed(
          () => mockState.pageAssignedCollection.value,
        ),
        cmsFieldOptionGroupsForProp,
        cmsBindingDisplayForProp,
        bindPropToCmsField,
        setPropBindingMode,
        unbindPropFromCms,
        ensureTemplatePageListDataSource,
        ensureTemplatePageDataSource,
        updateCmsCollection,
        updateCmsLoopCollection,
        updateCmsSingleEntry,
      }),
    };
  },
);

describe("selection toolbar CMS helpers", () => {
  it("prefers href over other link-like props", () => {
    expect(resolveLinkPropName(["label", "customLink", "href", "url"])).toBe(
      "href",
    );
  });

  it("finds link prop definitions from inspector properties", () => {
    const properties: PropertyDefinition[] = [
      makeProperty({ name: "label", type: "string", value: "Read more" }),
      makeProperty({ name: "href", type: "string", value: "#" }),
    ];

    expect(findLinkPropDefinition(properties)?.name).toBe("href");
  });

  it("shows loop button for repeat-capable nodes", () => {
    expect(
      shouldShowToolbarLoopButton({
        isRepeatCapable: true,
        hasInheritedLoopSource: false,
      }),
    ).toBe(true);

    expect(
      shouldShowToolbarLoopButton({
        isRepeatCapable: false,
        hasInheritedLoopSource: false,
      }),
    ).toBe(false);

    expect(
      shouldShowToolbarLoopButton({
        isRepeatCapable: true,
        hasInheritedLoopSource: true,
      }),
    ).toBe(false);
  });

  it("shows link button only when a link prop exists", () => {
    expect(
      shouldShowToolbarLinkButton({
        nodeType: "container",
        linkPropName: "href",
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);

    expect(
      shouldShowToolbarLinkButton({
        nodeType: "container",
        linkPropName: null,
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(false);

    expect(
      shouldShowToolbarLinkButton({
        nodeType: "container",
        linkPropName: "href",
        hasCmsContext: true,
        collectionsReady: false,
      }),
    ).toBe(false);
  });

  it("shows link button for link nodes even without href in properties", () => {
    expect(
      shouldShowToolbarLinkButton({
        nodeType: "link",
        linkPropName: null,
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);

    expect(
      shouldShowToolbarLinkButton({
        nodeType: "a",
        linkPropName: null,
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);
  });

  it("synthesizes href prop definition for link node types", () => {
    expect(findLinkPropDefinition([], "link")?.name).toBe("href");
    expect(findLinkPropDefinition([], "a")?.name).toBe("href");
    expect(findLinkPropDefinition([], "container")).toBeNull();
  });

  it("shows text toolbar button for link nodes", () => {
    expect(
      shouldShowToolbarTextButton({
        nodeType: "link",
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);

    expect(
      shouldShowToolbarTextButton({
        nodeType: "container",
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(false);
  });

  it("prefers src for image toolbar binding", () => {
    expect(resolveImagePropName(["alt", "src"])).toBe("src");
    const properties: PropertyDefinition[] = [
      makeProperty({ name: "src", type: "string" }),
    ];
    expect(findImagePropDefinition(properties)?.name).toBe("src");
  });

  it("shows image and text toolbar buttons for supported nodes", () => {
    expect(
      shouldShowToolbarImageButton({
        nodeType: "image",
        imagePropName: "src",
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);

    expect(
      shouldShowToolbarTextButton({
        nodeType: "heading",
        hasCmsContext: true,
        collectionsReady: true,
      }),
    ).toBe(true);
  });

  it("starts field pickers on static pages at collection select", () => {
    expect(
      resolveCmsQuickPickerInitialPage({
        mode: "field",
        hasSelectedCollection: true,
        requiresEntryStep: true,
        isEntryTemplatePage: false,
      }),
    ).toBe("collection");
  });

  it("auto-advances field pickers on entry template pages when collection is known", () => {
    expect(
      resolveCmsQuickPickerInitialPage({
        mode: "field",
        hasSelectedCollection: true,
        requiresEntryStep: true,
        isEntryTemplatePage: true,
      }),
    ).toBe("entry");

    expect(
      resolveCmsQuickPickerInitialPage({
        mode: "field",
        hasSelectedCollection: true,
        requiresEntryStep: false,
        isEntryTemplatePage: true,
      }),
    ).toBe("mapping");
  });

  it("keeps loop picker behavior unchanged", () => {
    expect(
      resolveCmsQuickPickerInitialPage({
        mode: "loop",
        hasSelectedCollection: true,
        requiresEntryStep: false,
        isEntryTemplatePage: false,
      }),
    ).toBe("mapping");

    expect(
      resolveCmsQuickPickerInitialPage({
        mode: "loop",
        hasSelectedCollection: false,
        requiresEntryStep: false,
        isEntryTemplatePage: false,
      }),
    ).toBe("collection");
  });
});

describe("useSelectionToolbarCms handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodesById.clear();
    selectedNodeRef.value = null;
    resolveNode.mockImplementation(
      (nodeId: string) => nodesById.get(nodeId) ?? null,
    );
    getNodeTarget.mockReturnValue({
      path: { collection: "pages" as const, id: "home" },
      nodeId: "parent",
    });
    getDocumentPath.mockReturnValue({
      collection: "pages" as const,
      id: "home",
    });
    cmsFieldOptionGroupsForProp.mockReturnValue([]);
    mockState.properties.value = [
      makeProperty({ name: "href", type: "string", value: "#" }),
    ];
    mockState.collections.value = [{ name: "blog", label: "Blog" }];
    mockState.cmsBindings.value = {};
    mockState.cmsDataSourceMode.value = "single";
    mockState.isSelectedNodeRepeatCapable.value = true;
    mockState.hasInheritedCmsLoopSource.value = false;
    mockState.isAssignedCmsTemplatePage.value = true;
    mockState.isListTemplatePage.value = false;
    mockState.isEntryTemplatePage.value = false;
    mockState.selectedCollection.value = { name: "blog", label: "Blog" };
    mockState.selectedCollectionName.value = "blog";
    mockState.selectedCmsEntryId.value = "";
    mockState.pageAssignedCollection.value = null;
    mockState.collectionsError.value = null;
    mockState.cmsEntriesError.value = null;
    mockState.cmsSourceError.value = null;
    mockState.isLoadingCollections.value = false;
    mockState.isLoadingCmsEntries.value = false;
  });

  it("activates loop mode and opens the props panel", async () => {
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleLoopActivate();

    expect(setTab).toHaveBeenCalledWith("props");
    expect(setPropBindingMode).toHaveBeenCalledWith("items", "dynamic");
  });

  it("only opens props when loop is already active", async () => {
    mockState.cmsDataSourceMode.value = "list";
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleLoopActivate();

    expect(setTab).toHaveBeenCalledWith("props");
    expect(setPropBindingMode).toHaveBeenCalledWith("items", "static");
  });

  it("binds link fields to the resolved href prop", async () => {
    mockState.isEntryTemplatePage.value = true;
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleLinkFieldSelect("blog.slug");

    expect(ensureTemplatePageDataSource).toHaveBeenCalled();
    expect(bindPropToCmsField).toHaveBeenCalledWith("href", "blog.slug");
  });

  it("clears text binding via unbindPropFromCms", async () => {
    mockState.cmsBindings.value = { text: "blog.title" };
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleTextFieldClear();

    expect(unbindPropFromCms).toHaveBeenCalledWith("text");
  });

  it("clears link binding via unbindPropFromCms", async () => {
    mockState.cmsBindings.value = { href: "blog.slug" };
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleLinkFieldClear();

    expect(unbindPropFromCms).toHaveBeenCalledWith("href");
  });

  it("clears image binding via unbindPropFromCms", async () => {
    mockState.properties.value = [
      makeProperty({ name: "src", type: "string" }),
    ];
    mockState.cmsBindings.value = { src: "blog.cover" };
    const toolbarCms = useSelectionToolbarCms();

    await toolbarCms.handleImageFieldClear();

    expect(unbindPropFromCms).toHaveBeenCalledWith("src");
  });

  it("clears quick field bindings for the selected CMS picker kind", async () => {
    mockState.properties.value = [
      makeProperty({ name: "src", type: "string" }),
      makeProperty({ name: "href", type: "string" }),
    ];
    mockState.cmsBindings.value = {
      text: "blog.title",
      src: "blog.cover",
      href: "blog.slug",
    };
    const toolbarCms = useSelectionToolbarCms();

    await expect(toolbarCms.clearQuickFieldBinding("text")).resolves.toEqual({
      success: true,
    });
    await expect(toolbarCms.clearQuickFieldBinding("image")).resolves.toEqual({
      success: true,
    });
    await expect(toolbarCms.clearQuickFieldBinding("link")).resolves.toEqual({
      success: true,
    });

    expect(unbindPropFromCms).toHaveBeenNthCalledWith(1, "text");
    expect(unbindPropFromCms).toHaveBeenNthCalledWith(2, "src");
    expect(unbindPropFromCms).toHaveBeenNthCalledWith(3, "href");
  });

  it("detects loop child binding targets and suggests compatible fields", () => {
    const parent: BuilderNode = {
      id: "parent",
      type: "container",
      props: {},
      styles: {},
      children: [
        {
          id: "title",
          type: "heading",
          props: { text: "Title" },
          styles: {},
          children: [],
        },
        {
          id: "cover",
          type: "image",
          props: { src: "" },
          styles: {},
          children: [],
        },
        {
          id: "cta",
          type: "link",
          props: { href: "#", text: "Read" },
          styles: {},
          children: [],
        },
      ],
    };
    selectedNodeRef.value = parent;
    for (const node of [parent, ...parent.children]) {
      nodesById.set(node.id, node);
    }
    cmsFieldOptionGroupsForProp.mockImplementation(
      (prop: PropertyDefinition): CmsBindingFieldOptionGroup[] => [
        {
          label: "Blog",
          options: [
            {
              label: "Title",
              path: "blog.title",
              type: "string",
              source: "schema" as const,
              depth: 0,
              isList: false,
            },
            {
              label: "Cover image",
              path: "blog.cover",
              type: "image",
              source: "schema" as const,
              depth: 0,
              isList: false,
            },
            {
              label: "Permalink",
              path: "blog.permalink",
              type: "url",
              source: "system" as const,
              depth: 0,
              isList: false,
            },
          ].filter((option) => {
            if (prop.name === "src") return option.type === "image";
            if (prop.name === "href") return option.type === "url";
            return option.type === "string";
          }),
        },
      ],
    );
    const toolbarCms = useSelectionToolbarCms();

    const targets = toolbarCms.quickBindingTargets({ mode: "loop" });

    expect(targets.map((target) => [target.nodeId, target.propName])).toEqual([
      ["title", "text"],
      ["cover", "src"],
      ["cta", "text"],
      ["cta", "href"],
    ]);
    expect(
      targets.find((target) => target.nodeId === "title")?.suggestedPath,
    ).toBe("blog.title");
    expect(
      targets.find((target) => target.nodeId === "cover")?.suggestedPath,
    ).toBe("blog.cover");
    expect(
      targets.find((target) => target.propName === "href")?.suggestedPath,
    ).toBe("blog.permalink");
  });

  it("applies quick loop child bindings through node-targeted mutations", async () => {
    const child: BuilderNode = {
      id: "title",
      type: "heading",
      props: { text: "Title" },
      styles: {},
      children: [],
    };
    const parent: BuilderNode = {
      id: "parent",
      type: "container",
      props: {},
      styles: {},
      children: [child],
    };
    selectedNodeRef.value = parent;
    nodesById.set(parent.id, parent);
    nodesById.set(child.id, child);
    const toolbarCms = useSelectionToolbarCms();

    const result = await toolbarCms.applyQuickBindings([
      {
        nodeId: "title",
        propName: "text",
        fieldPath: "blog.title",
        inherited: true,
      },
    ]);

    expect(result).toEqual({ success: true });
    expect(batchUpdate).toHaveBeenCalledWith(
      {
        path: { collection: "pages", id: "home" },
        nodeId: "title",
      },
      {
        dataSource: {
          type: "static",
          bindings: { text: "blog.title" },
        },
      },
      { description: "Bind text to CMS field" },
    );
  });

  it("applies quick bindings when live selection is lost but document path is valid", async () => {
    const child: BuilderNode = {
      id: "title",
      type: "heading",
      props: { text: "Title" },
      styles: {},
      children: [],
    };
    nodesById.set(child.id, child);
    getNodeTarget.mockReturnValue(null);
    getDocumentPath.mockReturnValue({
      collection: "pages",
      id: "blog",
    });
    const toolbarCms = useSelectionToolbarCms();

    const result = await toolbarCms.applyQuickBindings([
      {
        nodeId: "title",
        propName: "text",
        fieldPath: "blog.title",
        inherited: false,
      },
    ]);

    expect(result).toEqual({ success: true });
    expect(batchUpdate).toHaveBeenCalledWith(
      {
        path: { collection: "pages", id: "blog" },
        nodeId: "title",
      },
      expect.objectContaining({
        dataSource: expect.objectContaining({
          bindings: { text: "blog.title" },
        }),
      }),
      { description: "Bind text to CMS field" },
    );
  });
});
