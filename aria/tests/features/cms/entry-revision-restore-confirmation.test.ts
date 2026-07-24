import { mount, shallowMount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EntryEditorDrawer from "../../../admin/features/CMS/dialogs/EntryEditorDrawer.vue";
import RestoreEntryRevisionDialog from "../../../admin/features/CMS/dialogs/RestoreEntryRevisionDialog.vue";
import EntryDetailView from "../../../admin/features/CMS/views/EntryDetailView.vue";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";

const mocks = vi.hoisted(() => ({
  route: {
    params: { name: "blog", entrySlugOrId: "hello-world" },
  },
  navigateTo: vi.fn(),
  toastError: vi.fn(),
  collectionValue: null as AriaCollection | null,
  restoreRevision: vi.fn(),
  loadEntry: vi.fn(),
  loadRevisions: vi.fn(),
  resetRevisions: vi.fn(),
  submitUpdate: vi.fn(),
  invalidateEntryMutationCaches: vi.fn(),
  isRestoringRevisionValue: false,
  hasLoadedRevisionsValue: true,
  versionValue: "version-current",
  statusValue: "draft" as "draft" | "published",
  hasUnsavedChangesValue: false,
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
  },
}));

vi.mock(
  "../../../admin/features/Studio/settings/composables/useSettingsDialog",
  () => ({
    useSettingsDialog: () => ({
      isOpen: { value: false },
      activeTab: { value: "general" },
      selectedUserId: { value: null },
      sessionProfileDirty: { value: false },
      open: vi.fn(),
      close: vi.fn(async () => {}),
      toggle: vi.fn(),
      markSessionProfileDirty: vi.fn(),
      clearSessionProfileDirty: vi.fn(),
      registerFlushCallback: vi.fn(() => vi.fn()),
      flushPendingSaves: vi.fn(async () => {}),
      registerTabReset: vi.fn(() => vi.fn()),
      getTabResetHandler: vi.fn(() => null),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Studio/core/composables",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../admin/features/Studio/core/composables")
      >();
    return {
      ...actual,
      useStudioRouter: () => ({
        navigateTo: mocks.navigateTo,
      }),
    };
  },
);

vi.mock("../../../admin/features/CMS/composables/useCollectionDetail", () => ({
  useCollectionDetail: () => ({
    collection: ref(mocks.collectionValue),
    isLoading: ref(false),
    loadError: ref(null),
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCmsCapabilities", () => ({
  useCmsCapabilities: () => ({
    canUpdateEntry: ref(true),
    canPublishEntry: ref(true),
    canUnpublishEntry: ref(true),
    canArchiveEntry: ref(true),
    canDeleteEntry: ref(true),
    canListRevisions: ref(true),
    canRestoreRevision: ref(true),
    getForbiddenMessage: (capability: string) => `Forbidden: ${capability}`,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useEditEntryForm", () => ({
  useEditEntryForm: () => ({
    currentEntryRecord: ref(createEntryRecord()),
    activeLocaleCode: ref("en"),
    availableLocales: ref([{ code: "en", label: "English" }]),
    title: ref("Hello World"),
    slug: ref("hello-world"),
    status: ref(mocks.statusValue),
    bodyDocument: ref(null),
    frontmatterDraft: ref({}),
    relationDraft: ref({}),
    resolvedEntryId: ref("entry-1"),
    version: ref(mocks.versionValue),
    authorDisplayName: ref("Editor"),
    createdByDisplayName: ref("Editor"),
    updatedByDisplayName: ref("Editor"),
    publishedByDisplayName: ref(""),
    createdAt: ref("2026-06-28T00:00:00.000Z"),
    updatedAt: ref("2026-06-28T00:00:00.000Z"),
    publishedAt: ref(null),
    scheduledFor: ref(null),
    isLoading: ref(false),
    isSaving: ref(false),
    hasUnsavedChanges: computed(() => mocks.hasUnsavedChangesValue),
    loadError: ref(null),
    errors: ref({}),
    isSlugEdited: ref(false),
    loadEntry: mocks.loadEntry,
    switchActiveLocale: vi.fn(),
    updateSlugFromTitle: vi.fn(),
    markSlugEdited: vi.fn(),
    applyEntryRecord: vi.fn(),
    resetForm: vi.fn(),
    submitUpdate: mocks.submitUpdate,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useEntryRevisions", () => ({
  useEntryRevisions: () => ({
    revisions: ref([]),
    isLoadingRevisions: ref(false),
    isRestoringRevision: ref(mocks.isRestoringRevisionValue),
    hasLoadedRevisions: ref(mocks.hasLoadedRevisionsValue),
    revisionError: ref(null),
    loadRevisions: mocks.loadRevisions,
    restoreRevision: mocks.restoreRevision,
    resetRevisions: mocks.resetRevisions,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCmsEntryActions", () => ({
  useCmsEntryActions: () => ({
    isDeleting: ref(false),
    isTransitioning: ref(false),
    publishEntry: vi.fn(),
    unpublishEntry: vi.fn(),
    archiveEntry: vi.fn(),
    deleteEntry: vi.fn(),
  }),
}));

vi.mock("../../../admin/features/CMS/lib/cmsNavigationPreview", () => ({
  useCmsNavigationPreview: () => ({
    activeEntryPreview: ref(null),
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCmsDataCache", () => ({
  invalidateEntryMutationCaches: mocks.invalidateEntryMutationCaches,
}));

function createCollection(): AriaCollection {
  return {
    id: "collection-1",
    name: "blog",
    label: "Blog",
    kind: "content",
    scope: "collection",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    schema: {
      id: "collection-1",
      label: "Blog",
      kind: "content",
      fields: [],
      version: 1,
    },
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: ["body", "revisions"],
  };
}

function createEntryRecord(): AriaEntryRecord {
  return {
    entry: {
      id: "entry-1",
      collectionId: "collection-1",
      status: "draft",
      version: "version-current",
      authorId: "user-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: "entry-1",
        collectionId: "collection-1",
        locale: "en",
        slug: "hello-world",
        title: "Hello World",
        frontmatter: {},
        body: null,
        isSource: true,
      },
    ],
    relations: [],
  };
}

const ActivityTimelineStub = defineComponent({
  name: "ActivityTimeline",
  emits: ["action"],
  setup(_, { emit }) {
    return () =>
      h("button", {
        type: "button",
        "data-testid": "request-restore",
        onClick: () => emit("action", "revision-1", "restore"),
      });
  },
});

const EntryRevisionsPanelStub = defineComponent({
  name: "EntryRevisionsPanel",
  emits: ["open", "restore"],
  setup(_, { emit }) {
    return () =>
      h("button", {
        type: "button",
        "data-testid": "request-restore",
        onClick: () => emit("restore", "revision-1"),
      });
  },
});

const RestoreDialogStub = defineComponent({
  name: "RestoreEntryRevisionDialog",
  props: {
    open: { type: Boolean, required: true },
    isRestoring: { type: Boolean, required: true },
  },
  emits: ["update:open", "confirm"],
  setup(props, { emit }) {
    return () =>
      props.open
        ? h("div", { "data-testid": "restore-dialog" }, [
            h(
              "button",
              {
                type: "button",
                "data-testid": "cancel-restore",
                disabled: props.isRestoring,
                onClick: () => emit("update:open", false),
              },
              "Cancel",
            ),
            h(
              "button",
              {
                type: "button",
                "data-testid": "confirm-restore",
                disabled: props.isRestoring,
                onClick: () => emit("confirm"),
              },
              props.isRestoring ? "Restoring..." : "Restore Revision",
            ),
          ])
        : null;
  },
});

const commonStubs = {
  Button: true,
  Input: true,
  Label: true,
  Select: true,
  SelectContent: true,
  SelectItem: true,
  SelectTrigger: true,
  SelectValue: true,
  Sheet: { template: "<div><slot /></div>" },
  SheetContent: { template: "<div><slot /></div>" },
  SheetDescription: { template: "<div><slot /></div>" },
  SheetFooter: { template: "<div><slot /></div>" },
  SheetHeader: { template: "<div><slot /></div>" },
  SheetTitle: { template: "<div><slot /></div>" },
  CmsFrontmatterField: true,
  CmsRelationField: true,
  StructuredTextEditor: true,
  EntryPublishOverflowMenu: true,
  PagePublishSplitButton: true,
  HeaderActionTooltip: { template: "<div><slot /></div>" },
  ActivityTimeline: ActivityTimelineStub,
  DeleteEntryDialog: true,
  EntryRevisionsPanel: EntryRevisionsPanelStub,
  RestoreEntryRevisionDialog: RestoreDialogStub,
};

describe("RestoreEntryRevisionDialog", () => {
  function mountDialog(isRestoring = false) {
    return mount(RestoreEntryRevisionDialog, {
      props: {
        open: true,
        isRestoring,
      },
      global: {
        stubs: {
          Dialog: {
            props: ["open"],
            template: '<div v-if="open"><slot /></div>',
          },
          DialogContent: { template: "<div><slot /></div>" },
          DialogDescription: { template: "<p><slot /></p>" },
          DialogFooter: { template: "<footer><slot /></footer>" },
          DialogHeader: { template: "<header><slot /></header>" },
          DialogTitle: { template: "<h2><slot /></h2>" },
          Button: {
            props: ["disabled"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });
  }

  it("emits cancel and confirm actions", async () => {
    const wrapper = mountDialog();
    const buttons = wrapper.findAll("button");

    await buttons[0]!.trigger("click");
    await buttons[1]!.trigger("click");

    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("disables actions and shows loading copy while restoring", () => {
    const wrapper = mountDialog(true);
    const buttons = wrapper.findAll("button");

    expect(buttons[0]!.attributes("disabled")).toBeDefined();
    expect(buttons[1]!.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Restoring...");
  });
});

describe("entry revision restore confirmation", () => {
  beforeEach(() => {
    mocks.route.params = { name: "blog", entrySlugOrId: "hello-world" };
    mocks.collectionValue = createCollection();
    mocks.versionValue = "version-current";
    mocks.statusValue = "draft";
    mocks.isRestoringRevisionValue = false;
    mocks.hasLoadedRevisionsValue = true;
    mocks.restoreRevision.mockReset();
    mocks.restoreRevision.mockResolvedValue(createEntryRecord());
    mocks.loadEntry.mockReset();
    mocks.loadEntry.mockResolvedValue(true);
    mocks.loadRevisions.mockReset();
    mocks.resetRevisions.mockReset();
    mocks.submitUpdate.mockReset();
    mocks.submitUpdate.mockResolvedValue(true);
    mocks.invalidateEntryMutationCaches.mockReset();
    mocks.navigateTo.mockReset();
    mocks.hasUnsavedChangesValue = false;
  });

  it("opens confirmation from the entry detail page before restoring", async () => {
    const wrapper = shallowMount(EntryDetailView, {
      global: { stubs: commonStubs },
    });

    await nextTick();
    await wrapper.find('[data-testid="request-restore"]').trigger("click");
    await nextTick();

    expect(mocks.restoreRevision).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(true);

    await wrapper.find('[data-testid="cancel-restore"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(false);
    expect(mocks.restoreRevision).not.toHaveBeenCalled();
  });

  it("confirms entry detail restore with the selected revision id", async () => {
    const wrapper = shallowMount(EntryDetailView, {
      global: { stubs: commonStubs },
    });

    await nextTick();
    await wrapper.find('[data-testid="request-restore"]').trigger("click");
    await wrapper.find('[data-testid="confirm-restore"]').trigger("click");

    expect(mocks.restoreRevision).toHaveBeenCalledWith({
      collectionId: "collection-1",
      entryId: "entry-1",
      revisionId: "revision-1",
      expectedVersion: "version-current",
    });
    expect(mocks.invalidateEntryMutationCaches).toHaveBeenCalledWith(
      "collection-1",
    );
  });

  it("does not invalidate entry detail caches when restore fails", async () => {
    mocks.restoreRevision.mockResolvedValue(null);
    const wrapper = shallowMount(EntryDetailView, {
      global: { stubs: commonStubs },
    });

    await nextTick();
    await wrapper.find('[data-testid="request-restore"]').trigger("click");
    await wrapper.find('[data-testid="confirm-restore"]').trigger("click");

    expect(mocks.restoreRevision).toHaveBeenCalled();
    expect(mocks.invalidateEntryMutationCaches).not.toHaveBeenCalled();
  });

  it("invalidates entry detail caches after a successful save", async () => {
    mocks.hasUnsavedChangesValue = true;
    const wrapper = shallowMount(EntryDetailView, {
      global: {
        stubs: {
          ...commonStubs,
          Button: {
            props: ["disabled"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    await nextTick();
    const saveButton = wrapper.find("button .i-hugeicons\\:floppy-disk");
    expect(saveButton.exists()).toBe(true);
    await saveButton.trigger("click");

    expect(mocks.submitUpdate).toHaveBeenCalled();
    expect(mocks.invalidateEntryMutationCaches).toHaveBeenCalledWith(
      "collection-1",
    );
  });

  it("does not invalidate entry detail caches when save fails", async () => {
    mocks.hasUnsavedChangesValue = true;
    mocks.submitUpdate.mockResolvedValue(false);
    const wrapper = shallowMount(EntryDetailView, {
      global: {
        stubs: {
          ...commonStubs,
          Button: {
            props: ["disabled"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    await nextTick();
    const saveButton = wrapper.find("button .i-hugeicons\\:floppy-disk");
    expect(saveButton.exists()).toBe(true);
    await saveButton.trigger("click");

    expect(mocks.submitUpdate).toHaveBeenCalled();
    expect(mocks.invalidateEntryMutationCaches).not.toHaveBeenCalled();
  });

  it("suppresses the save toast when publishing unsaved changes", async () => {
    mocks.statusValue = "published";
    mocks.hasUnsavedChangesValue = true;
    const wrapper = shallowMount(EntryDetailView, {
      global: {
        stubs: {
          ...commonStubs,
          PagePublishSplitButton: {
            emits: ["publish-now"],
            template:
              '<button data-testid="publish-now" @click="$emit(\'publish-now\')" />',
          },
        },
      },
    });

    await nextTick();
    await wrapper.find('[data-testid="publish-now"]').trigger("click");

    expect(mocks.submitUpdate).toHaveBeenCalledWith(
      "collection-1",
      "entry-1",
      [],
      true,
      { showSuccessToast: false },
    );
  });

  it("opens confirmation from the entry editor drawer before restoring", async () => {
    const wrapper = shallowMount(EntryEditorDrawer, {
      props: {
        open: true,
        collection: createCollection(),
        entryId: "entry-1",
      },
      global: { stubs: commonStubs },
    });

    await nextTick();
    await wrapper.find('[data-testid="request-restore"]').trigger("click");
    await nextTick();

    expect(mocks.restoreRevision).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(true);

    await wrapper.find('[data-testid="confirm-restore"]').trigger("click");

    expect(mocks.restoreRevision).toHaveBeenCalledWith({
      collectionId: "collection-1",
      entryId: "entry-1",
      revisionId: "revision-1",
      expectedVersion: "version-current",
    });
    expect(mocks.invalidateEntryMutationCaches).toHaveBeenCalledWith(
      "collection-1",
    );
  });
});
