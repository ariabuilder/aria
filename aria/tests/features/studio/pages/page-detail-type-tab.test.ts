import { flushPromises, mount, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { z } from "zod";

import PageCmsTemplateAssignmentPanel from "../../../../admin/features/Studio/pages/components/detail/PageCmsTemplateAssignmentPanel.vue";
import PageDetailTypeTab from "../../../../admin/features/Studio/pages/components/detail/PageDetailTypeTab.vue";
import { usePageCmsTemplateAssignments } from "../../../../admin/features/Studio/pages/composables/usePageCmsTemplateAssignments";
import { AriaCollectionSchema } from "../../../../lib/cms/schemas";

type AriaCollection = z.infer<typeof AriaCollectionSchema>;

const { collectionsListMock, collectionsUpdateMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    collectionsListMock: vi.fn(),
    collectionsUpdateMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        list: collectionsListMock,
        update: collectionsUpdateMock,
      },
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/features/Studio/core/composables", () => ({
  useStudioRouter: () => ({
    navigateTo: vi.fn(),
  }),
}));

const CmsCollectionCommandSelectStub = defineComponent({
  name: "CmsCollectionCommandSelect",
  props: {
    modelValue: { type: String, default: "" },
    collections: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    isLoading: { type: Boolean, default: false },
    loadError: { type: String, default: null },
    placeholder: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("div", { "data-testid": "collection-command-select" }, [
        h("span", { "data-testid": "picker-loading" }, String(props.isLoading)),
        props.loadError
          ? h("span", { "data-testid": "picker-error" }, props.loadError)
          : null,
        h(
          "span",
          { "data-testid": "picker-count" },
          String(props.collections.length),
        ),
        ...(props.collections as Array<{ id: string; label: string }>).map(
          (collection) =>
            h(
              "button",
              {
                type: "button",
                "data-testid": `picker-item-${collection.id}`,
                onClick: () => emit("update:modelValue", collection.id),
              },
              collection.label,
            ),
        ),
      ]);
  },
});

const DeleteConfirmDialogStub = defineComponent({
  name: "DeleteConfirmDialog",
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    itemName: { type: String, default: "" },
    isLoading: { type: Boolean, default: false },
    confirmLabel: { type: String, default: "Delete" },
  },
  emits: ["update:open", "confirm"],
  setup(props, { emit }) {
    return () =>
      props.open
        ? h("div", { "data-testid": "unassign-dialog" }, [
            h("p", { "data-testid": "unassign-dialog-title" }, props.title),
            h(
              "button",
              {
                type: "button",
                "data-testid": "unassign-dialog-confirm",
                onClick: () => emit("confirm"),
              },
              props.confirmLabel,
            ),
          ])
        : null;
  },
});

const DialogStub = defineComponent({
  name: "Dialog",
  props: {
    open: { type: Boolean, default: false },
  },
  emits: ["update:open"],
  setup(props, { slots }) {
    return () =>
      props.open
        ? h("div", { "data-testid": "assign-dialog" }, slots.default?.())
        : null;
  },
});

const passthroughStub = (name: string) =>
  defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => h("div", attrs, slots.default?.());
    },
  });

function createCollection(
  overrides: Partial<AriaCollection> & { id: string; name: string },
): AriaCollection {
  return AriaCollectionSchema.parse({
    id: overrides.id,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    kind: overrides.kind ?? "content",
    schema: {
      id: overrides.id,
      label: overrides.label ?? overrides.name,
      kind: overrides.kind ?? "content",
      fields: [],
      icon: "i-hugeicons:file-01",
      navigation: { showInSidebar: true },
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: overrides.templatePageId ?? null,
    listPageId: overrides.listPageId ?? null,
    supports: [],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-28T00:00:00.000Z",
  });
}

const sharedStubs = {
  Button: defineComponent({
    name: "Button",
    setup(_, { attrs, slots }) {
      return () =>
        h("button", { ...attrs, type: "button" }, slots.default?.());
    },
  }),
  Label: defineComponent({
    name: "Label",
    setup(_, { attrs, slots }) {
      return () => h("label", attrs, slots.default?.());
    },
  }),
  Badge: defineComponent({
    name: "Badge",
    setup(_, { attrs, slots }) {
      return () => h("span", attrs, slots.default?.());
    },
  }),
  CmsCollectionCommandSelect: CmsCollectionCommandSelectStub,
  DeleteConfirmDialog: DeleteConfirmDialogStub,
  Dialog: DialogStub,
  DialogContent: passthroughStub("DialogContent"),
  DialogHeader: passthroughStub("DialogHeader"),
  DialogTitle: passthroughStub("DialogTitle"),
  DialogDescription: passthroughStub("DialogDescription"),
  DialogFooter: passthroughStub("DialogFooter"),
};

function mountTypeTab(props: Record<string, unknown> = {}) {
  return mount(PageDetailTypeTab, {
    props: {
      systemRole: "cms-entry",
      pageId: "page-template",
      isSavedCmsEntry: true,
      ...props,
    },
    global: {
      stubs: sharedStubs,
    },
  });
}

function mountAssignmentPanel(props: Record<string, unknown> = {}) {
  return mount(PageCmsTemplateAssignmentPanel, {
    props: {
      pageId: "page-template",
      slot: "template",
      ...props,
    },
    global: {
      stubs: sharedStubs,
    },
  });
}

describe("usePageCmsTemplateAssignments", () => {
  beforeEach(() => {
    collectionsListMock.mockReset();
    collectionsUpdateMock.mockReset();
  });

  it("maps list responses to collection summaries with entry counts", async () => {
    const blog = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
    });
    const settings = createCollection({
      id: "col_settings",
      name: "site-settings",
      label: "Site Settings",
      kind: "config",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [blog, settings],
        entryCounts: {
          [blog.id]: 4,
          [settings.id]: 1,
        },
      },
      error: undefined,
    });

    const pageId = ref("page-template");
    const { unassignedCollections, collections } = usePageCmsTemplateAssignments({
      pageId,
      slot: ref("template"),
    });

    await flushPromises();

    expect(collections.value).toEqual([
      expect.objectContaining({
        id: "col_blog",
        label: "Blog",
        kind: "content",
        itemCount: 4,
      }),
      expect.objectContaining({
        id: "col_settings",
        label: "Site Settings",
        kind: "config",
        itemCount: 1,
      }),
    ]);
    expect(unassignedCollections.value).toHaveLength(2);
  });

  it("excludes collections already assigned to the current page", async () => {
    const assigned = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      templatePageId: "page-template",
    });
    const available = createCollection({
      id: "col_news",
      name: "news",
      label: "News",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [assigned, available],
        entryCounts: {
          [assigned.id]: 2,
          [available.id]: 5,
        },
      },
      error: undefined,
    });

    const pageId = ref("page-template");
    const { assignedCollections, unassignedCollections } =
      usePageCmsTemplateAssignments({ pageId, slot: ref("template") });

    await flushPromises();

    expect(assignedCollections.value.map((collection) => collection.id)).toEqual(
      ["col_blog"],
    );
    expect(unassignedCollections.value.map((collection) => collection.id)).toEqual(
      ["col_news"],
    );
  });

  it("records load errors when collection listing fails", async () => {
    collectionsListMock.mockResolvedValue({
      data: undefined,
      error: { message: "Forbidden" },
    });

    const pageId = ref("page-template");
    const { loadError, collections } = usePageCmsTemplateAssignments({
      pageId,
      slot: ref("template"),
    });

    await flushPromises();

    expect(loadError.value).toBe("Forbidden");
    expect(collections.value).toEqual([]);
  });

  it("unassigns a collection by clearing templatePageId only", async () => {
    const assigned = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      templatePageId: "page-template",
      updatedAt: "2026-06-28T00:00:00.000Z",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [assigned],
        entryCounts: { [assigned.id]: 2 },
      },
      error: undefined,
    });

    collectionsUpdateMock.mockResolvedValue({
      data: {
        ...assigned,
        templatePageId: null,
        updatedAt: "2026-06-28T00:00:01.000Z",
      },
      error: undefined,
    });

    const pageId = ref("page-template");
    const { unassignCollection, assignedCollections } =
      usePageCmsTemplateAssignments({ pageId, slot: ref("template") });

    await flushPromises();
    expect(assignedCollections.value).toHaveLength(1);

    const updated = await unassignCollection("col_blog");

    expect(collectionsUpdateMock).toHaveBeenCalledWith({
      id: "col_blog",
      expectedUpdatedAt: "2026-06-28T00:00:00.000Z",
      patch: { templatePageId: null },
    });
    expect(updated?.templatePageId).toBeNull();
    expect(assignedCollections.value).toHaveLength(0);
  });
});

describe("PageDetailTypeTab collection picker", () => {
  beforeEach(() => {
    collectionsListMock.mockReset();
    collectionsUpdateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("renders a single-row header with an inline collection command search", async () => {
    collectionsListMock.mockResolvedValue({
      data: {
        collections: [
          createCollection({ id: "col_blog", name: "blog", label: "Blog" }),
        ],
        entryCounts: { col_blog: 2 },
      },
      error: undefined,
    });

    const wrapper = mountTypeTab();
    await flushPromises();

    expect(wrapper.find('[data-testid="cms-template-assignment-panel"]').exists()).toBe(
      true,
    );
    expect(
      wrapper.find('[data-testid="cms-template-assignment-command"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="assign-dialog"]').exists()).toBe(false);
  });

  it("assigns the selected collection from the inline command and emits assignCollection", async () => {
    const blog = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      updatedAt: "2026-06-28T00:00:00.000Z",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [blog],
        entryCounts: { col_blog: 2 },
      },
      error: undefined,
    });

    collectionsUpdateMock.mockResolvedValue({
      data: {
        ...blog,
        templatePageId: "page-template",
        updatedAt: "2026-06-28T00:00:01.000Z",
      },
      error: undefined,
    });

    const wrapper = mountTypeTab();
    await flushPromises();

    await wrapper.find('[data-testid="picker-item-col_blog"]').trigger("click");
    await flushPromises();

    expect(collectionsUpdateMock).toHaveBeenCalledWith({
      id: "col_blog",
      expectedUpdatedAt: "2026-06-28T00:00:00.000Z",
      patch: { templatePageId: "page-template" },
    });
    expect(wrapper.emitted("assignCollection")).toHaveLength(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Assigned as entry template for Blog",
    );
  });

  it("assigns CMS Collection pages as list templates", async () => {
    const blog = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      updatedAt: "2026-06-28T00:00:00.000Z",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [blog],
        entryCounts: { col_blog: 2 },
      },
      error: undefined,
    });

    collectionsUpdateMock.mockResolvedValue({
      data: {
        ...blog,
        listPageId: "page-template",
        updatedAt: "2026-06-28T00:00:01.000Z",
      },
      error: undefined,
    });

    const wrapper = mountTypeTab({
      systemRole: "cms-collection",
      isSavedCmsEntry: false,
      isSavedCmsCollection: true,
    });
    await flushPromises();

    await wrapper.find('[data-testid="picker-item-col_blog"]').trigger("click");
    await flushPromises();

    expect(collectionsUpdateMock).toHaveBeenCalledWith({
      id: "col_blog",
      expectedUpdatedAt: "2026-06-28T00:00:00.000Z",
      patch: { listPageId: "page-template" },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Assigned as list template for Blog",
    );
  });

  it("confirms before replacing an existing collection assignment", async () => {
    const blog = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      listPageId: "page-old-list",
      updatedAt: "2026-06-28T00:00:00.000Z",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [blog],
        entryCounts: { col_blog: 2 },
      },
      error: undefined,
    });

    collectionsUpdateMock.mockResolvedValue({
      data: {
        ...blog,
        listPageId: "page-template",
        updatedAt: "2026-06-28T00:00:01.000Z",
      },
      error: undefined,
    });

    const wrapper = mountTypeTab({
      systemRole: "cms-collection",
      isSavedCmsEntry: false,
      isSavedCmsCollection: true,
      pageTitle: "Current Page",
      pageOptions: [
        { id: "page-template", label: "Current Page" },
        { id: "page-old-list", label: "Old List" },
      ],
    });
    await flushPromises();

    await wrapper.find('[data-testid="picker-item-col_blog"]').trigger("click");
    await nextTick();

    expect(collectionsUpdateMock).not.toHaveBeenCalled();
    expect(
      wrapper.find('[data-testid="cms-template-assignment-inline-confirm"]').text(),
    ).toContain(
      "Blog already uses Old List as its list template. Assigning Current Page will replace that page.",
    );

    const confirmButton = wrapper
      .find('[data-testid="cms-template-assignment-inline-confirm"]')
      .findAll("button")
      .find((button) => button.text() === "Confirm assignment");
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger("click");
    await flushPromises();

    expect(collectionsUpdateMock).toHaveBeenCalledWith({
      id: "col_blog",
      expectedUpdatedAt: "2026-06-28T00:00:00.000Z",
      patch: { listPageId: "page-template" },
    });
  });

  it("surfaces collection load errors in the picker once the dialog is open", async () => {
    collectionsListMock.mockResolvedValue({
      data: undefined,
      error: { message: "Failed to load collections" },
    });

    const wrapper = mountTypeTab();
    await flushPromises();

    expect(wrapper.find('[data-testid="picker-error"]').text()).toBe(
      "Failed to load collections",
    );
  });

  it("hides the assignment panel until CMS template is selected", async () => {
    const wrapper = shallowMount(PageDetailTypeTab, {
      props: {
        systemRole: "standard",
        pageId: "page-template",
        isSavedCmsCollection: false,
        isSavedCmsEntry: false,
      },
      global: {
        stubs: {
          PageCmsTemplateAssignmentPanel: true,
        },
      },
    });

    await nextTick();

    expect(wrapper.find('[data-testid="cms-template-assignment-panel"]').exists()).toBe(
      false,
    );
  });

  it("shows assignment-clearing notice when switching a CMS template page back to Standard", async () => {
    const wrapper = shallowMount(PageDetailTypeTab, {
      props: {
        systemRole: "standard",
        pageId: "page-template",
        isSavedCmsEntry: false,
        isSavedCmsCollection: false,
        pendingAssignmentClears: [
          {
            collectionId: "col_tags",
            collectionLabel: "Tags",
            field: "templatePageId",
          },
        ],
      },
      global: {
        stubs: {
          PageCmsTemplateAssignmentPanel: true,
        },
      },
    });

    await nextTick();

    const notice = wrapper.find(
      '[data-testid="cms-template-assignment-standard-clear-notice"]',
    );
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain(
      "Saving will remove this page as the entry template for Tags.",
    );
  });
});

describe("PageCmsTemplateAssignmentPanel", () => {
  beforeEach(() => {
    collectionsListMock.mockReset();
    collectionsUpdateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("renders assigned collection rows with metadata", async () => {
    const assigned = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      templatePageId: "page-template",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [assigned],
        entryCounts: { [assigned.id]: 12 },
      },
      error: undefined,
    });

    const wrapper = mountAssignmentPanel();
    await flushPromises();

    const row = wrapper.find('[data-testid="assigned-collection-col_blog"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("Blog");
    expect(row.text()).toContain("blog · Content · 12 entries");
    expect(wrapper.find('[data-testid="cms-template-assignment-empty"]').exists()).toBe(
      false,
    );
  });

  it("shows empty state when no collections are assigned", async () => {
    collectionsListMock.mockResolvedValue({
      data: {
        collections: [
          createCollection({ id: "col_blog", name: "blog", label: "Blog" }),
        ],
        entryCounts: { col_blog: 2 },
      },
      error: undefined,
    });

    const wrapper = mountAssignmentPanel();
    await flushPromises();

    expect(wrapper.find('[data-testid="cms-template-assignment-empty"]').exists()).toBe(
      true,
    );
  });

  it("unassigns a collection after confirmation and emits unassignCollection", async () => {
    const assigned = createCollection({
      id: "col_blog",
      name: "blog",
      label: "Blog",
      templatePageId: "page-template",
      updatedAt: "2026-06-28T00:00:00.000Z",
    });

    collectionsListMock.mockResolvedValue({
      data: {
        collections: [assigned],
        entryCounts: { [assigned.id]: 2 },
      },
      error: undefined,
    });

    collectionsUpdateMock.mockResolvedValue({
      data: {
        ...assigned,
        templatePageId: null,
        updatedAt: "2026-06-28T00:00:01.000Z",
      },
      error: undefined,
    });

    const wrapper = mountAssignmentPanel();
    await flushPromises();

    const removeButton = wrapper
      .findAll("button")
      .find((button) => button.attributes("aria-label") === "Remove assignment");
    expect(removeButton).toBeTruthy();
    await removeButton!.trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="unassign-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="unassign-dialog-title"]').text()).toBe(
      "Remove entry template?",
    );

    await wrapper.find('[data-testid="unassign-dialog-confirm"]').trigger("click");
    await flushPromises();

    expect(collectionsUpdateMock).toHaveBeenCalledWith({
      id: "col_blog",
      expectedUpdatedAt: "2026-06-28T00:00:00.000Z",
      patch: { templatePageId: null },
    });
    expect(wrapper.emitted("unassignCollection")).toHaveLength(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Removed entry template for Blog",
    );
    expect(wrapper.find('[data-testid="assigned-collection-col_blog"]').exists()).toBe(
      false,
    );
  });
});
