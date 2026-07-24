import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useComposerQuickSwitch } from "../../../admin/features/Composer/composables/useComposerQuickSwitch";
import { quickSwitchTargetForOption } from "../../../admin/features/Composer/schemas/quickSwitch";
import {
  resetFeatureFlagsForTests,
  setFeatureFlagCacheForTests,
} from "../../../lib/features/resolve";

vi.mock("vue-sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("useComposerQuickSwitch", () => {
  beforeEach(() => {
    setFeatureFlagCacheForTests({
      "studio.layouts": false,
      "studio.agent": false,
    });
  });

  afterEach(() => {
    resetFeatureFlagsForTests();
    vi.clearAllMocks();
  });

  it("builds page groups excluding archived pages", () => {
    const onSelectPage = vi.fn();
    const { groups } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
        {
          id: "2",
          title: "Old",
          slug: "old",
          status: "archived",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    expect(groups.value).toHaveLength(1);
    expect(groups.value[0]?.options).toHaveLength(1);
    expect(groups.value[0]?.options[0]?.value).toBe("home");
  });

  it("omits layouts group when studio.layouts is disabled", () => {
    const { groups } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([
        {
          id: "layout-a",
          name: "Default",
          title: "Default Layout",
        },
      ]),
      availableComponents: ref([
        {
          id: "comp-a",
          name: "Hero",
          category: "marketing",
        },
      ]),
      currentItemSlug: ref("layout-a"),
      currentItemType: ref("layout"),
      currentPageTitle: ref(undefined),
      currentLayoutName: ref("Default"),
      onSelectPage: vi.fn(),
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    expect(
      groups.value.find((group) => group.label === "Layouts"),
    ).toBeUndefined();
    expect(
      groups.value.find((group) => group.label === "Components")?.options[0]
        ?.value,
    ).toBe("comp-a");
  });

  it("includes layouts group when studio.layouts is enabled", () => {
    setFeatureFlagCacheForTests({
      "studio.layouts": true,
      "studio.agent": false,
    });

    const { groups } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([
        {
          id: "layout-a",
          name: "Default",
          title: "Default Layout",
        },
      ]),
      availableComponents: ref([]),
      currentItemSlug: ref("layout-a"),
      currentItemType: ref("layout"),
      currentPageTitle: ref(undefined),
      currentLayoutName: ref("Default"),
      onSelectPage: vi.fn(),
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    expect(
      groups.value.find((group) => group.label === "Layouts")?.options[0]
        ?.value,
    ).toBe("layout-a");
  });

  it("builds typed CMS entry results for the Entries group", () => {
    const { groups } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      availableCmsEntries: ref([
        {
          id: "entry-1",
          collectionId: "collection-posts",
          collectionName: "posts",
          collectionLabel: "Posts",
          title: "Launch Notes",
          slug: "launch-notes",
          locale: "fr",
          status: "published",
        },
      ]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      onSelectPage: vi.fn(),
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    const option = groups.value.find((group) => group.label === "Entries")
      ?.options[0];
    expect(option).toMatchObject({
      itemType: "cms-entry",
      value: "entry-1",
      label: "Launch Notes",
      meta: "Posts",
      collectionName: "posts",
      slug: "launch-notes",
      locale: "fr",
    });
    expect(option && quickSwitchTargetForOption(option)).toEqual({
      itemType: "cms-entry",
      itemId: "entry-1",
      collectionId: "collection-posts",
      collectionName: "posts",
      collectionLabel: "Posts",
      title: "Launch Notes",
      slug: "launch-notes",
      locale: "fr",
      status: "published",
    });
  });

  it("saves pending Composer changes before opening a CMS entry", async () => {
    const ensureSaved = vi.fn().mockResolvedValue(true);
    const onSelectCmsEntry = vi.fn().mockResolvedValue(undefined);
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      hasUnsavedChanges: ref(true),
      ensureSaved,
      onSelectPage: vi.fn(),
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
      onSelectCmsEntry,
    });
    const target = {
      itemType: "cms-entry" as const,
      itemId: "entry-1",
      collectionId: "collection-posts",
      collectionName: "posts",
      collectionLabel: "Posts",
      title: "Launch Notes",
      slug: "launch-notes",
      locale: "fr",
      status: "published" as const,
    };

    await handleSelect(target);

    expect(ensureSaved).toHaveBeenCalledOnce();
    expect(onSelectCmsEntry).toHaveBeenCalledWith(target);
    expect(ensureSaved.mock.invocationCallOrder[0]).toBeLessThan(
      onSelectCmsEntry.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("calls onSelectPage when selecting a different page", () => {
    const onSelectPage = vi.fn();
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
        {
          id: "2",
          title: "About",
          slug: "about",
          status: "published",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    handleSelect({ itemType: "page", itemId: "about" });
    expect(onSelectPage).toHaveBeenCalledWith("about");
  });

  it("does not dispatch layout selection when studio.layouts is disabled", () => {
    const onSelectLayout = vi.fn();
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([
        {
          id: "shared-key",
          name: "Default",
          title: "Default Layout",
        },
      ]),
      availableComponents: ref([]),
      currentItemSlug: ref("shared-key"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      onSelectPage: vi.fn(),
      onSelectLayout,
      onSelectComponent: vi.fn(),
    });

    handleSelect({ itemType: "layout", itemId: "shared-key" });
    expect(onSelectLayout).not.toHaveBeenCalled();
  });

  it("does not emit when selecting the current item", () => {
    const onSelectPage = vi.fn();
    const { handleSelect, close, isOpen } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    isOpen.value = true;
    handleSelect({ itemType: "page", itemId: "home" });

    expect(onSelectPage).not.toHaveBeenCalled();
    expect(isOpen.value).toBe(false);
    void close;
  });

  it("defers unsaved-change confirmation to the navigation boundary when no ensureSaved is provided", async () => {
    const onSelectPage = vi.fn();
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
        {
          id: "2",
          title: "About",
          slug: "about",
          status: "published",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      hasUnsavedChanges: ref(true),
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    await handleSelect({ itemType: "page", itemId: "about" });
    expect(onSelectPage).toHaveBeenCalledWith("about");
  });

  it("flushes save then switches when ensureSaved succeeds", async () => {
    const onSelectPage = vi.fn();
    const ensureSaved = vi.fn().mockResolvedValue(true);
    const hasUnsavedChanges = ref(true);
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
        {
          id: "2",
          title: "About",
          slug: "about",
          status: "published",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      hasUnsavedChanges,
      ensureSaved,
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    await handleSelect({ itemType: "page", itemId: "about" });

    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(onSelectPage).toHaveBeenCalledWith("about");
  });

  it("blocks selection when ensureSaved fails", async () => {
    const onSelectPage = vi.fn();
    const ensureSaved = vi.fn().mockResolvedValue(false);
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([
        {
          id: "1",
          title: "Home",
          slug: "home",
          status: "published",
        },
        {
          id: "2",
          title: "About",
          slug: "about",
          status: "published",
        },
      ]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentPageTitle: ref("Home"),
      currentLayoutName: ref(undefined),
      hasUnsavedChanges: ref(true),
      ensureSaved,
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    await handleSelect({ itemType: "page", itemId: "about" });

    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it("rejects invalid selection payloads", () => {
    const onSelectPage = vi.fn();
    const { handleSelect } = useComposerQuickSwitch({
      availablePages: ref([]),
      availableLayouts: ref([]),
      availableComponents: ref([]),
      currentItemSlug: ref(""),
      currentItemType: ref(undefined),
      currentPageTitle: ref(undefined),
      currentLayoutName: ref(undefined),
      onSelectPage,
      onSelectLayout: vi.fn(),
      onSelectComponent: vi.fn(),
    });

    handleSelect({ itemType: "page", itemId: "" });
    handleSelect(null);
    expect(onSelectPage).not.toHaveBeenCalled();
  });
});
