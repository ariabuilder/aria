import { describe, expect, it, vi, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useSearchDialog } from "../../../../admin/features/Studio/search/composables/useSearchDialog";

const replace = vi.fn();
const routeState = vi.hoisted(() => ({
  path: "/pages/testing",
  hash: "",
  query: {} as Record<string, string | string[] | undefined>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({
    replace,
  }),
}));

describe("useSearchDialog", () => {
  beforeEach(() => {
    replace.mockClear();
    routeState.path = "/pages/testing";
    routeState.hash = "";
    routeState.query = { composer: "" };
    const dialog = useSearchDialog();
    dialog.isOpen.value = false;
  });

  it("preserves composer when opening search in composer mode", () => {
    const dialog = useSearchDialog();
    dialog.open();

    expect(dialog.isOpen.value).toBe(true);
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: { composer: null, search: "true" },
    });
  });

  it("removes search from the URL while preserving composer on close", async () => {
    routeState.query = { composer: "", search: "true" };
    const dialog = useSearchDialog();
    dialog.isOpen.value = true;

    dialog.close();
    await nextTick();

    expect(dialog.isOpen.value).toBe(false);
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: { composer: null },
    });
  });

  it("syncs search=true to the URL in studio mode", () => {
    routeState.query = {};
    const dialog = useSearchDialog();
    dialog.open();

    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: { search: "true" },
    });
  });

  it("removes search from the URL when closing in studio mode", async () => {
    routeState.query = { search: "true" };
    const dialog = useSearchDialog();
    dialog.isOpen.value = true;

    dialog.close();
    await nextTick();

    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: {},
    });
  });
});
