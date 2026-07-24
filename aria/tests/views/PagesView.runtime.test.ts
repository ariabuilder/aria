import { computed, defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppProvides } from "../../admin/features/Core";

vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: "/studio/pages",
    query: {},
    fullPath: "/studio/pages",
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const testState = vi.hoisted(() => {
  const samplePage = {
    id: "page-1",
    slug: "home",
    name: "Home",
    title: "Home",
    status: "draft",
    path: "/",
  };

  return {
    samplePage,
    pageActionsOptions: [] as unknown[],
    refreshPagesMock: vi.fn(async () => undefined),
    refreshPagesNowMock: vi.fn(async () => undefined),
    selectPageMock: vi.fn(),
    setCreatePageDialogOpenMock: vi.fn(),
    requestDeletePageMock: vi.fn(),
    setDeleteDialogOpenMock: vi.fn(),
    closeDeleteDialogMock: vi.fn(),
    createPageMock: vi.fn(),
    renamePageMock: vi.fn(),
    duplicatePageMock: vi.fn(async () => undefined),
    deletePageMock: vi.fn(async () => undefined),
  };
});

vi.mock("../../admin/features/Studio/composer/composables", () => ({
  useStudioData: () => ({
    pages: ref([testState.samplePage]),
    layouts: ref([]),
    refreshPages: testState.refreshPagesMock,
    refreshPagesNow: testState.refreshPagesNowMock,
  }),
  useStudioDialogState: () => ({
    isCreatePageDialogOpen: ref(false),
    setCreatePageDialogOpen: testState.setCreatePageDialogOpenMock,
  }),
  useStudioActions: () => ({
    createPage: testState.createPageMock,
    renamePage: testState.renamePageMock,
    duplicatePage: testState.duplicatePageMock,
    deletePage: testState.deletePageMock,
  }),
  useStudioPageActions: (options: unknown) => {
    testState.pageActionsOptions.push(options);

    return {
      isHomePage: () => false,
      isPagePublishPending: () => false,
      isPageThumbnailPending: () => false,
      getPageThumbnailRefreshToken: () => "",
      getPublicPagePath: () => "/",
      handlePrefetchPage: vi.fn(),
      handleEditPage: vi.fn(),
      handleCreatePage: vi.fn(),
      handleCreatePageSubmit: vi.fn(async () => undefined),
      handleDuplicatePage: vi.fn(async () => undefined),
      handleRegenerateThumbnail: vi.fn(async () => undefined),
      handleTogglePublishStatus: vi.fn(async () => undefined),
      handleDeletePage: vi.fn(async () => undefined),
      confirmDeletePage: vi.fn(async () => undefined),
      handleViewPage: vi.fn(),
    };
  },
  useStudioPagesCreateFlow: () => ({
    submitCreatePage: vi.fn(async () => undefined),
  }),
  useStudioPagesDialogState: () => ({
    isDeleteDialogOpen: ref(false),
    pageToDelete: ref(null),
    requestDeletePage: testState.requestDeletePageMock,
    setDeleteDialogOpen: testState.setDeleteDialogOpenMock,
    closeDeleteDialog: testState.closeDeleteDialogMock,
  }),
  useStudioPagesListState: () => ({
    searchQuery: ref(""),
    filteredPages: ref([testState.samplePage]),
    pageRows: ref([
      {
        page: testState.samplePage,
      },
    ]),
  }),
  useStudioPagesRenameState: () => ({
    editingPageId: ref<string | null>(null),
    editingTitle: ref(""),
    renameInputRef: ref<HTMLInputElement | null>(null),
    startRename: vi.fn(),
    confirmRename: vi.fn(async () => undefined),
    cancelRename: vi.fn(),
    handleRenameKeydown: vi.fn(),
    getInlineRenameWidth: vi.fn(() => "10ch"),
  }),
  useStudioPagesViewState: () => ({
    viewMode: ref<"grid" | "list">("grid"),
    gridDensity: ref(2),
    gridLayoutStyle: computed(() => ({ gridTemplateColumns: "1fr" })),
  }),
  useStudioSelectionState: () => ({
    selectedPageId: ref<string | null>(null),
    selectPage: testState.selectPageMock,
  }),
}));

vi.mock("../../admin/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: ref([testState.samplePage]),
    layouts: ref([]),
    isLoading: ref(false),
    isReady: ref(true),
    refreshPages: testState.refreshPagesMock,
    refreshPagesNow: testState.refreshPagesNowMock,
    applyOptimisticPageRemoval: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      pages: {
        usageIndex: vi.fn(async () => ({
          data: { usagesByPageId: {} },
          error: null,
        })),
      },
    },
  },
}));

vi.mock("@/features/Studio/metrics/composables/useStudioMetrics", () => ({
  useStudioMetrics: () => ({
    trackPageListView: vi.fn(),
    isCloudflarePlatform: ref(false),
    canShowMetrics: ref(false),
  }),
}));

vi.mock("@/features/Studio/core/composables", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/Studio/core/composables")
  >();
  return {
    ...actual,
    useStudioRouter: () => ({
      navigateTo: vi.fn(),
      startEditing: vi.fn(),
    }),
    useDialogState: () => ({
      isOpen: ref(false),
      open: vi.fn(),
      close: vi.fn(),
    }),
    useSelectedIds: () => ({
      selectedIds: ref<string[]>([]),
      clearSelection: vi.fn(),
    }),
  };
});

vi.mock("../../admin/features/Studio/index", () => ({
  CreatePageDialog: defineComponent({
    name: "CreatePageDialogStub",
    setup() {
      return () => h("div");
    },
  }),
  DeletePageDialog: defineComponent({
    name: "DeletePageDialogStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../admin/features/Studio/pages/components/PageGridCard.vue", () => ({
  default: defineComponent({
    name: "PageGridCardStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock(
  "../../admin/features/Studio/pages/components/PageGridCardExperimental.vue",
  () => ({
    default: defineComponent({
      name: "PageGridCardExperimentalStub",
      setup() {
        return () => h("div");
      },
    }),
  }),
);

vi.mock("../../admin/features/Studio/pages/dialogs/DeletePageDialog.vue", () => ({
  default: defineComponent({
    name: "DeletePageDialogStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../admin/features/Studio/pages/utils/deviceCapabilities", () => ({
  isIOS: () => false,
  isThumbnailCaptureSupported: () => true,
}));

const mountOptions = {
  global: {
    stubs: {
      Badge: true,
      Button: true,
      Checkbox: true,
      ContextMenu: true,
      ContextMenuContent: true,
      ContextMenuItem: true,
      ContextMenuSeparator: true,
      ContextMenuTrigger: true,
      DropdownMenu: true,
      DropdownMenuContent: true,
      DropdownMenuItem: true,
      DropdownMenuSeparator: true,
      DropdownMenuTrigger: true,
      Input: true,
      Table: true,
      TableBody: true,
      TableCell: true,
      TableHead: true,
      TableHeader: true,
      TableRow: true,
      Transition: false,
    },
  },
};

describe("Pages runtime injections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.pageActionsOptions.length = 0;
  });

  it("mounts without the removed eager page-prefetch provider", async () => {
    const PagesView = (
      await import("../../admin/features/Studio/pages/PagesView.vue")
    ).default;

    const wrapper = mount(PagesView, { shallow: true });

    expect(wrapper.exists()).toBe(true);
    expect(testState.refreshPagesMock).not.toHaveBeenCalled();
  });

  it("still supports the Composer prewarm provider used by page cards", async () => {
    const PagesView = (
      await import("../../admin/features/Studio/pages/PagesView.vue")
    ).default;

    const prefetchPageData = vi.fn(async (_slug: string) => undefined);
    const prewarmBuilder = vi.fn(async () => undefined);

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => null),
          prefetchPageData,
          prewarmBuilder,
        });

        return () => h(PagesView);
      },
    });

    const wrapper = mount(Provider, mountOptions);

    expect(wrapper.exists()).toBe(true);
    expect(prefetchPageData).toBeDefined();
    expect(prewarmBuilder).toBeDefined();
  });

});
