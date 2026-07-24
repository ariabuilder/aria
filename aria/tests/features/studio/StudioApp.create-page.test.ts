import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  startEditing: vi.fn(),
  closeCreatePageDialog: vi.fn(),
  openCreatePageDialog: vi.fn(),
  createPageDialogOpen: { value: true },
  routerReplace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  RouterView: defineComponent({
    name: "RouterView",
    setup(_props, { slots }) {
      const RouteComponent = defineComponent({
        name: "RouteComponent",
        setup() {
          return () => h("div", { "data-testid": "route-component" });
        },
      });

      return () => slots.default?.({ Component: RouteComponent });
    },
  }),
  useRoute: () => ({
    path: "/pages",
  }),
  useRouter: () => ({
    replace: mocks.routerReplace,
  }),
}));

vi.mock("../../../admin/features/Studio/pages/dialogs/CreatePageDialog.vue", () => ({
  default: defineComponent({
    name: "CreatePageDialogStub",
    emits: ["created", "update:open"],
    setup() {
      return () => h("div", { "data-testid": "create-page-dialog" });
    },
  }),
}));

vi.mock("../../../admin/features/Studio/pages/composables/useCreatePageDialog", () => ({
  useCreatePageDialog: () => ({
    isOpen: mocks.createPageDialogOpen,
    open: mocks.openCreatePageDialog,
    close: mocks.closeCreatePageDialog,
    toggle: vi.fn(),
  }),
}));

vi.mock("../../../admin/features/CMS/dialogs/CreateCollectionDialog.vue", () => ({
  default: defineComponent({
    name: "CreateCollectionDialogStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCreateCollectionDialog", () => ({
  useCreateCollectionDialog: () => ({
    isOpen: ref(false),
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}));

vi.mock("../../../admin/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: ref([]),
    layouts: ref([]),
    components: ref([]),
    refreshComponentsNow: vi.fn(async () => undefined),
    siteSettings: ref({ onboarding: { status: "complete" } }),
    isInitialized: ref(true),
  }),
}));

vi.mock("../../../admin/features/Studio/core/composables", () => ({
  useStudioRouter: () => ({
    navigateTo: mocks.navigateTo,
    startEditing: mocks.startEditing,
  }),
}));

vi.mock("../../../admin/features/Design", () => ({
  useAppearance: vi.fn(),
}));

vi.mock("../../../admin/features/Auth/composables/useUser", () => ({
  useUser: () => ({
    fetchUser: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../../admin/features/Blocks", () => ({
  CreateComponentDialog: defineComponent({
    name: "CreateComponentDialogStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../../admin/features/Studio/composer/composables/useStudioActions", () => ({
  useStudioActions: () => ({
    createComponent: vi.fn(),
  }),
}));

vi.mock("../../../admin/features/Studio/components/composables", () => ({
  useCreateComponentDialog: () => ({
    isOpen: ref(false),
    open: vi.fn(),
    close: vi.fn(),
    submitCreateComponent: vi.fn(async () => null),
  }),
  useComponentGrouping: () => ({
    customGroups: ref([]),
    canUpdateGrouping: ref(false),
    createCustomGroup: vi.fn(async () => null),
    moveComponentToGroup: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../../admin/features/Studio/settings/components/SlugChangeRedirectPrompt.vue", () => ({
  default: defineComponent({
    name: "SlugChangeRedirectPromptStub",
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../../admin/features/Studio/core/lib/studioPanelShell", () => ({
  STUDIO_MAIN_CLASS: "studio-main",
  STUDIO_SPLIT_MAIN_CLASS: "studio-split-main",
}));

vi.mock("../../../admin/features/Studio/core/components/ErrorBoundary.vue", () => ({
  default: defineComponent({
    name: "ErrorBoundaryStub",
    setup(_props, { slots }) {
      return () => slots.default?.();
    },
  }),
}));

describe("StudioApp page creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPageDialogOpen.value = true;
  });

  it("routes newly created pages to details before Composer", async () => {
    const StudioApp = (
      await import("../../../admin/features/Studio/StudioApp.vue")
    ).default;

    const wrapper = mount(StudioApp, {
      global: {
        stubs: {
          KeepAlive: false,
          Suspense: false,
        },
      },
    });

    wrapper
      .getComponent({ name: "CreatePageDialogStub" })
      .vm.$emit("created", "new-slug");

    expect(mocks.closeCreatePageDialog).toHaveBeenCalledOnce();
    expect(mocks.navigateTo).toHaveBeenCalledWith("/pages/new-slug");
    expect(mocks.startEditing).not.toHaveBeenCalled();
  });
});
