import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useStudioCommandPalette } from "../../../../admin/features/Studio/search/composables/useStudioCommandPalette";
import {
  resetFeatureFlagsForTests,
  setFeatureFlagCacheForTests,
} from "../../../../lib/features/resolve";

const navigateTo = vi.fn();
const startEditing = vi.fn();
const openCreateComponentDialog = vi.fn();
const setEditingTab = vi.fn();
const settingsOpen = vi.fn();
const createPageDialogOpen = vi.fn();
const updateAppearance = vi.fn();
const routerPush = vi.fn();

const appearanceSettings = vi.hoisted(() => ({
  value: {
    themeId: "aria" as const,
    colorScheme: "system" as const,
    fontFamily: "Outfit" as const,
    uiZoom: 1,
  },
}));

vi.mock("../../../../admin/features/Design", () => ({
  useAppearance: () => ({
    settings: appearanceSettings,
    updateAppearance,
    isLoading: ref(false),
  }),
}));

vi.mock("../../../../admin/features/Studio/core/composables", () => ({
  useStudioRouter: () => ({
    navigateTo,
    startEditing,
  }),
}));

vi.mock("../../../../admin/features/Core", () => ({
  useAppRouter: () => ({
    setEditingTab,
  }),
}));

vi.mock("../../../../admin/features/Studio/settings", () => ({
  useSettingsDialog: () => ({
    open: settingsOpen,
  }),
}));

vi.mock(
  "../../../../admin/features/Studio/pages/composables/useCreatePageDialog",
  () => ({
    useCreatePageDialog: () => ({
      open: createPageDialogOpen,
      close: vi.fn(),
      toggle: vi.fn(),
      isOpen: ref(false),
    }),
  }),
);

vi.mock(
  "../../../../admin/features/Studio/components/composables/useCreateComponentDialog",
  () => ({
    useCreateComponentDialog: () => ({
      isOpen: ref(false),
      isCreating: ref(false),
      open: openCreateComponentDialog,
      close: vi.fn(),
      submitCreateComponent: vi.fn(),
    }),
  }),
);

vi.mock("../../../../admin/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canCreatePage: ref(true),
    isContributor: ref(false),
    canEditItemInComposer: () => true,
  }),
}));

const routeMock = vi.hoisted(() => ({
  value: { query: {} as Record<string, string | undefined> },
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeMock.value,
  useRouter: () => ({ push: routerPush }),
}));

describe("useStudioCommandPalette", () => {
  beforeEach(() => {
    setFeatureFlagCacheForTests({
      "studio.layouts": false,
      "studio.agent": false,
    });
    routeMock.value = { query: {} };
    appearanceSettings.value = {
      themeId: "aria",
      colorScheme: "system",
      fontFamily: "Outfit",
      uiZoom: 1,
    };
    navigateTo.mockClear();
    startEditing.mockClear();
    setEditingTab.mockClear();
    settingsOpen.mockClear();
    createPageDialogOpen.mockClear();
    openCreateComponentDialog.mockClear();
    updateAppearance.mockClear();
    routerPush.mockClear();
  });

  afterEach(() => {
    resetFeatureFlagsForTests();
  });

  it("omits layout navigation when studio.layouts is disabled", () => {
    const searchQuery = ref("");
    const { defaultItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    expect(
      defaultItems.value.find((item) => item.id === "nav-layouts"),
    ).toBeUndefined();
  });

  it("navigates to studio sections via useStudioRouter", () => {
    const searchQuery = ref("");
    const { defaultItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    const pagesNav = defaultItems.value.find((item) => item.id === "nav-pages");
    pagesNav?.action();

    expect(navigateTo).toHaveBeenCalledWith("pages");
  });

  it("adds separate open and edit commands for pages when searching", () => {
    const searchQuery = ref("home");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([{ slug: "home", title: "Home" }]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    const pageItems = groupedItems.value.Pages ?? [];
    const openItem = pageItems.find((item) => item.id === "open-page-home");
    const editItem = pageItems.find((item) => item.id === "edit-page-home");

    expect(openItem?.label).toBe("Open Home");
    expect(editItem?.label).toBe("Edit Home in Composer");

    openItem?.action();
    expect(navigateTo).toHaveBeenCalledWith("/pages/home");

    editItem?.action();
    expect(startEditing).toHaveBeenCalledWith("page", "home");
  });

  it("shows switch-only page commands when already in composer", () => {
    routeMock.value = { query: { composer: "" } };
    const searchQuery = ref("home");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([{ slug: "home", title: "Home" }]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    const pageItems = groupedItems.value.Pages ?? [];
    expect(
      pageItems.find((item) => item.id === "open-page-home"),
    ).toBeUndefined();
    expect(
      pageItems.find((item) => item.id === "edit-page-home"),
    ).toBeUndefined();

    const switchItem = pageItems.find((item) => item.id === "switch-page-home");
    expect(switchItem?.label).toBe("Switch to Home");

    switchItem?.action();
    expect(startEditing).toHaveBeenCalledWith("page", "home");
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("opens settings via the settings dialog singleton", () => {
    const searchQuery = ref("");
    const { defaultItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    const settingsItem = defaultItems.value.find(
      (item) => item.id === "nav-settings",
    );
    settingsItem?.action();

    expect(settingsOpen).toHaveBeenCalled();
  });

  it("includes appearance theme items when searching", () => {
    const searchQuery = ref("signal");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    const appearanceItems = groupedItems.value.Appearance ?? [];
    const signalTheme = appearanceItems.find(
      (item) => item.id === "appearance-theme-cloudflare",
    );

    expect(signalTheme?.label).toBe("Use Signal theme");
  });

  it("applies theme via useAppearance when selecting a theme command", () => {
    const close = vi.fn();
    const searchQuery = ref("astro");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close,
    });

    const astroTheme = groupedItems.value.Appearance?.find(
      (item) => item.id === "appearance-theme-astro",
    );
    astroTheme?.action();

    expect(close).toHaveBeenCalled();
    expect(updateAppearance).toHaveBeenCalledWith(
      { themeId: "astro" },
      { animate: true },
    );
  });

  it("opens appearance settings tab from the appearance settings command", () => {
    const close = vi.fn();
    const searchQuery = ref("appearance");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close,
    });

    const settingsItem = groupedItems.value.Appearance?.find(
      (item) => item.id === "appearance-settings",
    );
    settingsItem?.action();

    expect(close).toHaveBeenCalled();
    expect(settingsOpen).toHaveBeenCalledWith("appearance");
  });

  it("opens create page dialog instead of navigating to /pages/new", () => {
    const close = vi.fn();
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery: ref("create page"),
      close,
    });

    const createItem = groupedItems.value.Create?.find(
      (item) => item.id === "create-page",
    );
    createItem?.action();

    expect(close).toHaveBeenCalled();
    expect(createPageDialogOpen).toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalledWith("/pages/new");
  });

  it("opens create component dialog from the palette", () => {
    const close = vi.fn();
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery: ref("create component"),
      close,
    });

    const createItem = groupedItems.value.Create?.find(
      (item) => item.id === "create-component",
    );
    createItem?.action();

    expect(close).toHaveBeenCalled();
    expect(openCreateComponentDialog).toHaveBeenCalled();
    expect(startEditing).not.toHaveBeenCalled();
  });

  it("adds CMS entry commands that navigate by collection name and entry slug", async () => {
    const close = vi.fn();
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      cmsEntries: ref([
        {
          id: "entry-1",
          collectionId: "collection-posts",
          collectionName: "posts",
          collectionLabel: "Posts",
          title: "Launch Notes",
          slug: "launch-notes",
          locale: "en",
          status: "draft",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ]),
      isLoading: ref(false),
      searchQuery: ref("launch"),
      close,
    });

    const entryItem = groupedItems.value.Entries?.find(
      (item) => item.id === "open-cms-entry-posts-entry-1",
    );

    expect(entryItem?.label).toBe("Launch Notes");
    expect(entryItem?.description).toBe("Posts / launch-notes");

    await entryItem?.action();

    expect(routerPush).toHaveBeenCalledWith({
      name: "cms-entry-detail",
      params: {
        name: "posts",
        entrySlugOrId: "launch-notes",
      },
      query: { locale: "en" },
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("navigates CMS collection results without racing the search dialog route", async () => {
    const close = vi.fn();
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
      cmsCollections: ref([
        {
          id: "collection-posts",
          name: "posts",
          label: "Posts",
        },
      ]),
      isLoading: ref(false),
      searchQuery: ref("posts"),
      close,
    });

    const collectionItem = groupedItems.value.Entries?.find(
      (item) => item.id === "open-cms-collection-collection-posts",
    );

    await collectionItem?.action();

    expect(routerPush).toHaveBeenCalledWith("/collections/posts");
    expect(close).not.toHaveBeenCalled();
  });

  it("uses default items only when search query is whitespace", () => {
    const searchQuery = ref("   ");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([{ slug: "main", name: "Main" }]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    expect(groupedItems.value.Appearance).toBeUndefined();
    expect(groupedItems.value.Layouts).toBeUndefined();
    expect(groupedItems.value["Quick Navigation"]).toBeDefined();
  });

  it("omits layout search results when studio.layouts is disabled", () => {
    const searchQuery = ref("main");
    const { groupedItems } = useStudioCommandPalette({
      pages: ref([]),
      layouts: ref([{ slug: "main", name: "Main", title: "Main Layout" }]),
      components: ref([]),
      isLoading: ref(false),
      searchQuery,
      close: vi.fn(),
    });

    expect(groupedItems.value.Layouts).toBeUndefined();
    expect(
      Object.values(groupedItems.value)
        .flat()
        .some((item) => item.id.startsWith("switch-layout-")),
    ).toBe(false);
    expect(
      Object.values(groupedItems.value)
        .flat()
        .some((item) => item.id.startsWith("edit-layout-")),
    ).toBe(false);
  });
});
