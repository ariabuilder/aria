import { describe, expect, it, vi, beforeEach } from "vitest";
import { nextTick } from "vue";

const replace = vi.fn();
const routeState = vi.hoisted(() => ({
  path: "/pages/index",
  hash: "",
  query: {} as Record<string, string | string[] | null | undefined>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({
    replace,
  }),
}));

describe("useRouteQueryDialog composer overlay sync", () => {
  beforeEach(() => {
    vi.resetModules();
    replace.mockClear();
    routeState.path = "/pages/index";
    routeState.hash = "";
    routeState.query = {};
  });

  it("hydrates settings from the initial URL query", async () => {
    routeState.path = "/dashboard";
    routeState.query = { settings: "users" };

    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();

    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.activeTab.value).toBe("users");
    expect(replace).not.toHaveBeenCalled();
  });

  it("preserves composer when opening settings from composer mode", async () => {
    routeState.query = { composer: "" };
    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();
    dialog.close();
    await nextTick();

    dialog.open("users", "aaaaaaaa-bbbb-4ccc-8ddd-111111111111");

    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.activeTab.value).toBe("users");
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/index",
      hash: "",
      query: { composer: null, settings: "users" },
    });
  });

  it("syncs settings to the URL in studio mode", async () => {
    routeState.query = {};

    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();
    dialog.close();
    await nextTick();

    dialog.open("users");

    expect(dialog.isOpen.value).toBe(true);
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/index",
      hash: "",
      query: { settings: "users" },
    });
  });

  it("removes settings from the URL while preserving composer on close", async () => {
    routeState.query = { composer: "", settings: "users" };

    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();
    dialog.isOpen.value = true;
    dialog.activeTab.value = "users";
    await nextTick();

    await dialog.close();

    expect(replace).toHaveBeenCalledWith({
      path: "/pages/index",
      hash: "",
      query: { composer: null },
    });
  });
});
