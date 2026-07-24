import { mount, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref } from "vue";

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  startEditing: vi.fn(),
  openCreateComponentDialog: vi.fn(),
  createComponent: vi.fn(),
  renameComponent: vi.fn(async () => true),
  duplicateComponent: vi.fn(async () => "copy-id"),
  deleteComponent: vi.fn(async () => true),
  toastError: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: mocks.toastError,
  },
}));

vi.mock("../../../../admin/components/ui/button", () => ({
  Button: defineComponent({
    setup(_props, { slots }) {
      return () => h("button", slots.default?.());
    },
  }),
}));

vi.mock("../../../../admin/components/ui/badge", () => ({
  Badge: defineComponent({
    setup(_props, { slots }) {
      return () => h("span", slots.default?.());
    },
  }),
}));

vi.mock("../../../../admin/components/ui/table", () => {
  const PassThrough = defineComponent({
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  return {
    Table: PassThrough,
    TableBody: PassThrough,
    TableCell: PassThrough,
    TableRow: PassThrough,
  };
});

vi.mock("../../../../admin/components/ui/context-menu", () => {
  const PassThrough = defineComponent({
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
    },
  });
  return {
    ContextMenu: PassThrough,
    ContextMenuTrigger: PassThrough,
    ContextMenuContent: PassThrough,
    ContextMenuItem: PassThrough,
    ContextMenuSeparator: PassThrough,
  };
});

const refreshComponentsNowMock = vi.fn(async () => undefined);
const refreshStaleComponentThumbnailsMock = vi.fn(async () => undefined);

vi.mock("../../../../admin/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    refreshComponentsNow: refreshComponentsNowMock,
    applyOptimisticComponentRemoval: vi.fn(() => vi.fn()),
    components: ref([
      {
        id: "hero",
        name: "Hero",
        category: "marketing",
        source: "custom",
        tier: "free",
        isLocked: false,
        updatedAt: null,
      },
    ]),
    isLoading: ref(false),
    isReady: computed(() => true),
  }),
}));

vi.mock(
  "../../../../admin/features/Studio/components/composables/useComponentThumbnailActions",
  () => ({
    useComponentThumbnailActions: () => ({
      isComponentThumbnailPending: () => false,
      getComponentThumbnailRefreshToken: () => "",
      refreshStaleComponentThumbnails: refreshStaleComponentThumbnailsMock,
      regenerateThumbnail: vi.fn(),
    }),
  }),
);

vi.mock("../../../../admin/features/Studio/core/composables", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../admin/features/Studio/core/composables")
  >("../../../../admin/features/Studio/core/composables");
  return {
    ...actual,
    useStudioRouter: () => ({
      navigateTo: mocks.navigateTo,
      startEditing: mocks.startEditing,
    }),
  };
});

vi.mock(
  "../../../../admin/features/Studio/components/composables/useCreateComponentDialog",
  () => ({
    useCreateComponentDialog: () => ({
      isOpen: ref(false),
      isCreating: ref(false),
      open: mocks.openCreateComponentDialog,
      close: vi.fn(),
      submitCreateComponent: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../../admin/features/Studio/composer/composables/useStudioActions",
  () => ({
    useStudioActions: () => ({
      createComponent: mocks.createComponent,
      renameComponent: mocks.renameComponent,
      duplicateComponent: mocks.duplicateComponent,
      deleteComponent: mocks.deleteComponent,
      deleteComponentsBatch: vi.fn(async () => ({
        succeeded: 2,
        failed: 0,
        errors: [],
      })),
    }),
  }),
);

vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: "/components",
    query: {},
    fullPath: "/components",
  }),
}));

vi.mock(
  "../../../../admin/features/Studio/components/composables/useComponentGrouping",
  () => ({
    useComponentGrouping: () => ({
      canReadGrouping: computed(() => false),
      canUpdateGrouping: computed(() => false),
      hasHydratedFromServer: ref(true),
      customGroups: ref([]),
      componentGroupAssignments: ref({}),
      groupedComponents: computed(() => [
        {
          key: "category:marketing",
          name: "marketing",
          items: [{ id: "hero", name: "Hero", category: "marketing" }],
          isCustomGroup: false,
        },
      ]),
      buildEffectiveAssignments: () => ({}),
      getGroupMemberCount: () => 0,
      createCustomGroup: vi.fn(),
      renameCustomGroup: vi.fn(),
      deleteCustomGroup: vi.fn(),
      moveComponentToGroup: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../../admin/features/Studio/components/composables/useComponentsOrganizeState",
  () => ({
    useComponentsOrganizeState: () => ({
      activeFilter: ref("all"),
      isGroupFilterActive: computed(() => false),
      activeGroupId: ref(null),
      setActiveFilter: vi.fn(),
    }),
  }),
);

vi.mock("../../../../admin/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canCreatePage: computed(() => true),
    canDeletePage: computed(() => true),
    canEditItemInComposer: () => true,
    composerOperationForItem: () => "save.component",
    getForbiddenMessage: () => "forbidden",
  }),
}));

vi.mock("../../../../admin/features/Studio/core/components", () => {
  const PassThrough = defineComponent({
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  const PageHeaderStub = defineComponent({
    setup(_props, { slots }) {
      return () =>
        h("div", [
          h("div", slots.search?.()),
          h("div", slots.toolbar?.()),
          h("div", slots.default?.()),
        ]);
    },
  });

  return {
    PageHeader: PageHeaderStub,
    SearchOrBulkToolbar: PassThrough,
    BulkSelectionToolbar: PassThrough,
    ExpandableSearchInput: PassThrough,
    FilterIconMenu: PassThrough,
    EmptyState: PassThrough,
    DeleteConfirmDialog: PassThrough,
    SkeletonTable: PassThrough,
    StudioLeftRailReveal: PassThrough,
    StudioPanelShell: PassThrough,
    StudioTableHeader: PassThrough,
    StudioTableColGroup: PassThrough,
  };
});

describe("ComponentsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshStaleComponentThumbnailsMock.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it("renders and tolerates invalid persisted view mode", async () => {
    window.localStorage.setItem("aria:components:view-mode", "invalid-value");
    const ComponentsView = (
      await import("../../../../admin/features/Studio/components/ComponentsView.vue")
    ).default;

    const wrapper = shallowMount(ComponentsView, {
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" },
          ComponentGridCard: { template: "<div />" },
          ComponentsContextMenuContent: { template: "<div />" },
          ComponentsOrganizerRail: { template: "<aside />" },
          Table: { template: "<table><slot /></table>" },
          TableBody: { template: "<tbody><slot /></tbody>" },
          TableRow: { template: "<tr><slot /></tr>" },
          TableCell: { template: "<td><slot /></td>" },
          ContextMenu: { template: "<div><slot /></div>" },
          ContextMenuTrigger: { template: "<div><slot /></div>" },
          ContextMenuContent: { template: "<div><slot /></div>" },
          DropdownMenu: { template: "<div><slot /></div>" },
          DropdownMenuContent: { template: "<div><slot /></div>" },
          DropdownMenuTrigger: { template: "<div><slot /></div>" },
          DropdownMenuItem: { template: "<button><slot /></button>" },
        },
      },
    });

    expect(wrapper.exists()).toBe(true);
  });

  it("opens component detail route from grid card open action", async () => {
    window.localStorage.setItem("aria:components:view-mode", "grid");
    const ComponentsView = (
      await import("../../../../admin/features/Studio/components/ComponentsView.vue")
    ).default;
    const wrapper = mount(ComponentsView, {
      global: {
        stubs: {
          Button: false,
          BulkSelectionToolbar: true,
          ExpandableSearchInput: true,
          FilterIconMenu: true,
          HeaderActionDropdownTooltip: true,
          StudioTableColumnMenu: true,
          StudioPanelShell: {
            template: "<div><slot name='rail' /><slot /></div>",
          },
          StudioLeftRailReveal: true,
          ComponentGridCard: {
            template:
              "<button type='button' @click=\"$emit('open')\">Open</button>",
          },
          ComponentsContextMenuContent: { template: "<div />" },
          ComponentsOrganizerRail: { template: "<aside />" },
          Table: { template: "<table><slot /></table>" },
          TableBody: { template: "<tbody><slot /></tbody>" },
          TableRow: { template: "<tr><slot /></tr>" },
          TableCell: { template: "<td><slot /></td>" },
          ContextMenu: { template: "<div><slot /></div>" },
          ContextMenuTrigger: { template: "<div><slot /></div>" },
          ContextMenuContent: { template: "<div><slot /></div>" },
        },
      },
    });

    const openButton = wrapper.findAll("button").find((button) => button.text().trim() === "Open");
    expect(openButton).toBeDefined();
    await openButton!.trigger("click");

    expect(mocks.navigateTo).toHaveBeenCalledWith("/components/hero");
  });

  it("opens composer after creating a new component", async () => {
    window.localStorage.setItem("aria:components:view-mode", "grid");
    const ComponentsView = (
      await import("../../../../admin/features/Studio/components/ComponentsView.vue")
    ).default;
    const wrapper = mount(ComponentsView, {
      global: {
        stubs: {
          Button: false,
          BulkSelectionToolbar: true,
          ExpandableSearchInput: true,
          FilterIconMenu: true,
          HeaderActionDropdownTooltip: true,
          StudioTableColumnMenu: true,
          StudioPanelShell: {
            template: "<div><slot name='rail' /><slot /></div>",
          },
          StudioLeftRailReveal: true,
          ComponentGridCard: { template: "<div />" },
          ComponentsContextMenuContent: { template: "<div />" },
          ComponentsOrganizerRail: { template: "<aside />" },
          Table: { template: "<table><slot /></table>" },
          TableBody: { template: "<tbody><slot /></tbody>" },
          TableRow: { template: "<tr><slot /></tr>" },
          TableCell: { template: "<td><slot /></td>" },
          ContextMenu: { template: "<div><slot /></div>" },
          ContextMenuTrigger: { template: "<div><slot /></div>" },
          ContextMenuContent: { template: "<div><slot /></div>" },
        },
      },
    });

    const createButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Component"));
    expect(createButton).toBeDefined();
    await createButton!.trigger("click");

    expect(mocks.openCreateComponentDialog).toHaveBeenCalled();
    expect(mocks.createComponent).not.toHaveBeenCalled();
    expect(mocks.startEditing).not.toHaveBeenCalled();
  });

  it("refreshes only stale thumbnails on activate instead of bulk warmup", async () => {
    window.localStorage.setItem("aria:components:view-mode", "grid");
    const ComponentsView = (
      await import("../../../../admin/features/Studio/components/ComponentsView.vue")
    ).default;

    const KeepAliveWrapper = defineComponent({
      components: { ComponentsView },
      template: "<KeepAlive><ComponentsView /></KeepAlive>",
    });

    mount(KeepAliveWrapper, {
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" },
          ComponentGridCard: { template: "<div />" },
          ComponentsContextMenuContent: { template: "<div />" },
          ComponentsOrganizerRail: { template: "<aside />" },
          Table: { template: "<table><slot /></table>" },
          TableBody: { template: "<tbody><slot /></tbody>" },
          TableRow: { template: "<tr><slot /></tr>" },
          TableCell: { template: "<td><slot /></td>" },
          ContextMenu: { template: "<div><slot /></div>" },
          ContextMenuTrigger: { template: "<div><slot /></div>" },
          ContextMenuContent: { template: "<div><slot /></div>" },
          DropdownMenu: { template: "<div><slot /></div>" },
          DropdownMenuContent: { template: "<div><slot /></div>" },
          DropdownMenuTrigger: { template: "<div><slot /></div>" },
          DropdownMenuItem: { template: "<button><slot /></button>" },
        },
      },
    });

    expect(refreshStaleComponentThumbnailsMock).toHaveBeenCalledTimes(1);
  });
});
