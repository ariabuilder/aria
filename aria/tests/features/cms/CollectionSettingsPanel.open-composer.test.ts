import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import CollectionSettingsPanel from "../../../admin/features/CMS/components/CollectionSettingsPanel.vue";
import type { AriaCollection } from "../../../lib/cms/schemas";

const {
  collectionUpdateMock,
  fetchCollectionsMock,
  startEditingMock,
  toastErrorMock,
  toastSuccessMock,
  upsertCollectionSummaryMock,
  refreshPagesNowMock,
} = vi.hoisted(() => ({
  collectionUpdateMock: vi.fn(),
  fetchCollectionsMock: vi.fn(),
  startEditingMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  upsertCollectionSummaryMock: vi.fn(),
  refreshPagesNowMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        update: collectionUpdateMock,
      },
    },
    pages: {
      updatePolicy: vi.fn(),
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/lib/actionErrors", () => ({
  handleActionResultForbidden: () => false,
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: {
      value: [
        {
          id: "page-list",
          title: "Posts",
          slug: "posts",
          systemRole: "standard",
        },
        {
          id: "page-entry",
          title: "Post Template",
          slug: "post-template",
          systemRole: "cms-entry",
        },
      ],
    },
    refreshPagesNow: refreshPagesNowMock,
  }),
}));

vi.mock("@/features/Studio/core/composables", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/Studio/core/composables")
  >();
  return {
    ...actual,
    useStudioRouter: () => ({
      startEditing: startEditingMock,
    }),
  };
});

vi.mock("../../../admin/features/CMS/composables/useCmsCapabilities", () => ({
  useCmsCapabilities: () => ({
    canUpdateCollection: { value: true },
    canDeleteCollection: { value: true },
    getForbiddenMessage: (operation: string) => `Forbidden: ${operation}`,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCollectionIcons", () => ({
  useCollectionIcons: () => ({
    getCollectionIcon: (icon: string) => icon,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCollectionsList", () => ({
  useCollectionsList: () => ({
    upsertCollectionSummary: upsertCollectionSummaryMock,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCmsDataCache", () => ({
  fetchCollections: fetchCollectionsMock,
}));

vi.mock("../../../admin/features/CMS/lib/actionTimeout", () => ({
  withCmsActionTimeout: <T,>(promise: Promise<T>) => promise,
}));

const CollectionPublishingSectionStub = defineComponent({
  name: "CollectionPublishingSection",
  emits: [
    "update:listPageId",
    "update:templatePageId",
    "update:urlPattern",
    "resetUrlPatternToAuto",
    "editPageInComposer",
    "setAsCmsTemplate",
  ],
  template: "<div />",
});

const DeleteConfirmDialogStub = defineComponent({
  name: "DeleteConfirmDialog",
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    itemName: { type: String, default: "" },
    isLoading: { type: Boolean, default: false },
    confirmLabel: { type: String, default: "Confirm" },
  },
  emits: ["update:open", "confirm"],
  template:
    '<div v-if="open" data-testid="reassign-dialog"><p data-testid="reassign-title">{{ title }}</p><p data-testid="reassign-description">{{ description }}</p><button data-testid="reassign-confirm" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>',
});

function createCollection(
  overrides: Partial<AriaCollection> = {},
): AriaCollection {
  return {
    id: "collection-posts",
    name: "posts",
    label: "Posts",
    kind: "content",
    schema: {
      id: "collection-posts",
      label: "Posts",
      kind: "content",
      fields: [],
      icon: "i-hugeicons:file-01",
      navigation: {
        showInSidebar: true,
      },
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: ["body"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

async function mountPanel(collection = createCollection()) {
  const wrapper = shallowMount(CollectionSettingsPanel, {
    props: {
      collection,
    },
    global: {
      stubs: {
        CollectionPublishingSection: CollectionPublishingSectionStub,
        PageHeader: true,
        Button: true,
        Checkbox: true,
        IconPickerDialog: true,
        Input: true,
        Label: true,
        Switch: true,
        CmsCollectionIconPreview: true,
        DeleteCollectionDialog: true,
        DeleteConfirmDialog: DeleteConfirmDialogStub,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("CollectionSettingsPanel composer open", () => {
  beforeEach(() => {
    collectionUpdateMock.mockReset();
    fetchCollectionsMock.mockReset();
    startEditingMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    upsertCollectionSummaryMock.mockReset();
    refreshPagesNowMock.mockReset();
    fetchCollectionsMock.mockResolvedValue({
      collections: [createCollection()],
    });
    collectionUpdateMock.mockImplementation(
      async (payload: {
        patch: {
          label: string;
          kind: AriaCollection["kind"];
          scope: AriaCollection["scope"];
          urlPattern: string | null;
          templatePageId: string | null;
          listPageId: string | null;
        };
      }) => ({
        data: createCollection({
          label: payload.patch.label,
          kind: payload.patch.kind,
          scope: payload.patch.scope,
          urlPattern: payload.patch.urlPattern,
          templatePageId: payload.patch.templatePageId,
          listPageId: payload.patch.listPageId,
          updatedAt: "2026-06-03T00:00:00.000Z",
        }),
        error: null,
      }),
    );
  });

  it("saves draft page assignments before opening composer", async () => {
    const wrapper = await mountPanel();
    const publishing = wrapper.findComponent({
      name: "CollectionPublishingSection",
    });

    publishing.vm.$emit("update:listPageId", "page-list");
    publishing.vm.$emit("editPageInComposer", "posts");
    await flushPromises();

    expect(collectionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          listPageId: "page-list",
        }),
      }),
    );
    expect(startEditingMock).toHaveBeenCalledWith("page", "posts");
    expect(
      collectionUpdateMock.mock.invocationCallOrder[0],
    ).toBeLessThan(startEditingMock.mock.invocationCallOrder[0]);
    expect(refreshPagesNowMock).toHaveBeenCalled();
  });

  it("opens composer without saving when settings are clean", async () => {
    const wrapper = await mountPanel();
    const publishing = wrapper.findComponent({
      name: "CollectionPublishingSection",
    });

    publishing.vm.$emit("editPageInComposer", "posts");
    await flushPromises();

    expect(collectionUpdateMock).not.toHaveBeenCalled();
    expect(startEditingMock).toHaveBeenCalledWith("page", "posts");
  });

  it("does not open composer when saving settings fails", async () => {
    collectionUpdateMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to update collection" },
    });
    const wrapper = await mountPanel();
    const publishing = wrapper.findComponent({
      name: "CollectionPublishingSection",
    });

    publishing.vm.$emit("update:templatePageId", "page-entry");
    publishing.vm.$emit("editPageInComposer", "post-template");
    await flushPromises();

    expect(collectionUpdateMock).toHaveBeenCalled();
    expect(startEditingMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to update collection");
  });

  it("confirms before replacing an existing list template page", async () => {
    const wrapper = await mountPanel(
      createCollection({ listPageId: "page-old-list" }),
    );
    const publishing = wrapper.findComponent({
      name: "CollectionPublishingSection",
    });

    publishing.vm.$emit("update:listPageId", "page-list");
    await (wrapper.vm as unknown as { saveSettings: () => Promise<void> })
      .saveSettings();
    await flushPromises();

    expect(collectionUpdateMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="reassign-title"]').text()).toBe(
      "Reassign collection?",
    );
    expect(wrapper.find('[data-testid="reassign-description"]').text()).toContain(
      "Posts already uses another page as its list template",
    );

    await wrapper.find('[data-testid="reassign-confirm"]').trigger("click");
    await flushPromises();

    expect(collectionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          listPageId: "page-list",
        }),
      }),
    );
    expect(refreshPagesNowMock).toHaveBeenCalled();
  });
});
