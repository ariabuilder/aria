import { shallowMount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CollectionDetailView from "../../../admin/features/CMS/views/CollectionDetailView.vue";
import type { AriaCollection } from "../../../lib/cms/schemas";

const mocks = vi.hoisted(() => ({
  route: {
    path: "/collections/blog/settings",
    params: { name: "blog" },
  },
  navigateTo: vi.fn(),
  state: null as null | ReturnType<typeof createCollectionDetailState>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
}));

vi.mock("vuedraggable", () => ({
  default: defineComponent({
    name: "Draggable",
    setup(_, { slots }) {
      return () => h("div", slots.default?.({ element: null }));
    },
  }),
}));

vi.mock("../../../admin/features/Studio/core/composables", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../admin/features/Studio/core/composables")
  >();
  return {
    ...actual,
    resolveBulkTargets: () => [],
    useStudioRouter: () => ({
      navigateTo: mocks.navigateTo,
    }),
  };
});

vi.mock("../../../admin/features/CMS/composables/useCollectionDetailState", () => ({
  useCollectionDetailState: () => mocks.state,
}));

vi.mock("../../../admin/features/CMS/composables/useCmsCapabilities", () => ({
  useCmsCapabilities: () => ({
    canCreateEntry: ref(true),
    getForbiddenMessage: (capability: string) => `Forbidden: ${capability}`,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCollectionIcons", () => ({
  useCollectionIcons: () => ({
    getCollectionIcon: (icon: string) => icon,
    getCollectionIconForKind: () => "i-hugeicons:file-01",
  }),
}));

vi.mock("../../../admin/features/CMS/lib/cmsNavigationPreview", () => ({
  useCmsNavigationPreview: () => ({
    activeCollectionPreview: ref(null),
  }),
}));

function createCollection(): AriaCollection {
  return {
    id: "col_blog",
    name: "blog",
    label: "Blog",
    kind: "content",
    scope: "collection",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    schema: {
      id: "col_blog",
      label: "Blog",
      kind: "content",
      fields: [],
      icon: "i-hugeicons:file-01",
      navigation: {
        showInSidebar: true,
      },
      version: 1,
    },
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: ["body"],
  } satisfies AriaCollection;
}

function createCollectionDetailState() {
  const collection = ref(createCollection());
  return {
    collection,
    loadCollection: vi.fn(),
    isLoading: ref(false),
    loadError: ref(null),
    rows: ref([]),
    total: ref(0),
    page: ref(1),
    totalPages: ref(1),
    searchQuery: ref(""),
    statusFilter: ref("all"),
    statusFilters: ref([]),
    table: {
      getAllLeafColumns: () => [],
      getState: () => ({ sorting: [] }),
      setSorting: vi.fn(),
      setColumnOrder: vi.fn(),
      getRowModel: () => ({ rows: [] }),
    },
    supportsCover: ref(false),
    isCreatingEntry: ref(false),
    entryActions: {
      isTransitioning: ref(false),
      isDeleting: ref(false),
      publishEntries: vi.fn(),
      unpublishEntries: vi.fn(),
      archiveEntries: vi.fn(),
      duplicateEntries: vi.fn(),
      deleteEntries: vi.fn(),
    },
    selectedEntryIds: ref([]),
    clearSelection: vi.fn(),
    openCreateEntry: vi.fn(),
    openEntryEditor: vi.fn(),
    setPage: vi.fn(),
    setStatusFilter: vi.fn(),
    refreshEntries: vi.fn(),
  };
}

function mountView(path: string) {
  mocks.route.path = path;
  mocks.route.params = { name: "blog" };
  mocks.state = createCollectionDetailState();

  return shallowMount(CollectionDetailView, {
    global: {
      stubs: {
        CollectionSettingsPanel: defineComponent({
          name: "CollectionSettingsPanel",
          props: {
            collection: { type: Object, required: true },
            embedded: { type: Boolean, default: false },
          },
          emits: ["updated", "deleted"],
          setup(_, { emit }) {
            return () =>
              h("section", { "data-testid": "settings-panel" }, [
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => emit("updated", createCollection()),
                  },
                  "save settings",
                ),
              ]);
          },
        }),
        CollectionSchemaPanel: defineComponent({
          name: "CollectionSchemaPanel",
          props: {
            collection: { type: Object, required: true },
            embedded: { type: Boolean, default: false },
          },
          emits: ["updated"],
          setup(_, { emit }) {
            return () =>
              h("section", { "data-testid": "schema-panel" }, [
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => emit("updated", createCollection()),
                  },
                  "save schema",
                ),
              ]);
          },
        }),
        PageHeader: true,
        DeleteEntryDialog: true,
      },
    },
  });
}

describe("CollectionDetailView configure layout", () => {
  beforeEach(() => {
    mocks.navigateTo.mockReset();
  });

  it("renders settings and schema together on the configure route", () => {
    const wrapper = mountView("/collections/blog/settings");

    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schema-panel"]').exists()).toBe(true);
  });

  it("treats the legacy schema route as the configure view", () => {
    const wrapper = mountView("/collections/blog/schema");

    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schema-panel"]').exists()).toBe(true);
  });

  it("refreshes collection state when either configure panel updates", async () => {
    const wrapper = mountView("/collections/blog/settings");

    await wrapper.find('[data-testid="settings-panel"] button').trigger("click");
    await nextTick();
    await wrapper.find('[data-testid="schema-panel"] button').trigger("click");

    expect(mocks.state?.loadCollection).toHaveBeenCalledTimes(2);
  });
});

describe("CollectionDetailView breadcrumb", () => {
  beforeEach(() => {
    mocks.navigateTo.mockReset();
  });

  function breadcrumbNav(path: string) {
    const wrapper = mountView(path);
    return wrapper.find("nav");
  }

  it("shows Settings on the configure route", () => {
    const nav = breadcrumbNav("/collections/blog/settings");

    expect(nav.text()).toContain("Settings");
    expect(nav.text()).toContain("Blog");
  });

  it("does not show Settings on the entries route", () => {
    const nav = breadcrumbNav("/collections/blog");

    expect(nav.text()).toContain("Blog");
    expect(nav.text()).not.toContain("Settings");
  });

  it("navigates to entries when the collection name is clicked on settings", async () => {
    const wrapper = mountView("/collections/blog/settings");
    const collectionButton = wrapper
      .findAll("nav button")
      .find((button) => button.text() === "Blog");

    expect(collectionButton).toBeDefined();
    await collectionButton!.trigger("click");

    expect(mocks.navigateTo).toHaveBeenCalledWith("/collections/blog");
  });

  it("navigates to entries when back is clicked on settings", async () => {
    const wrapper = mountView("/collections/blog/settings");
    const backButton = wrapper.find('[data-testid="collection-detail-back"]');

    await backButton.trigger("click");

    expect(mocks.navigateTo).toHaveBeenCalledWith("/collections/blog");
  });

  it("navigates to collections when back is clicked on entries", async () => {
    const wrapper = mountView("/collections/blog");
    const backButton = wrapper.find('[data-testid="collection-detail-back"]');

    await backButton.trigger("click");

    expect(mocks.navigateTo).toHaveBeenCalledWith("/collections");
  });
});
