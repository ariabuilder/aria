import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
}));
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: routerReplace }),
}));

import { useDesignSection } from "../../../admin/features/Design/composables/useDesignSection";

describe("useDesignSection", () => {
  beforeEach(() => {
    routeState.query = {};
    routerReplace.mockClear();
    window.localStorage.clear();
  });

  it("defaults bare Design routes to Colors", () => {
    const { currentDesignSection } = useDesignSection();

    expect(currentDesignSection.value).toBe("colors");
  });

  it("sends removed or invalid deep links to Colors", () => {
    routeState.query = { overview: undefined };
    window.localStorage.setItem("aria-design-section", "typography");

    const { currentDesignSection } = useDesignSection();

    expect(currentDesignSection.value).toBe("colors");
  });

  it("keeps valid section deep links", () => {
    routeState.query = { typography: undefined };

    const { currentDesignSection } = useDesignSection();

    expect(currentDesignSection.value).toBe("typography");
  });

  it("restores a valid stored section only for a bare Design route", () => {
    window.localStorage.setItem("aria-design-section", "variable-manager");

    const { currentDesignSection } = useDesignSection();

    expect(currentDesignSection.value).toBe("variable-manager");
  });

  it("writes the Colors query and selection", () => {
    routeState.query = { typography: undefined, source: "dashboard" };
    const { setDesignSection } = useDesignSection();

    setDesignSection("colors");

    expect(routerReplace).toHaveBeenCalledWith({
      query: { source: "dashboard", colors: null },
    });
    expect(window.localStorage.getItem("aria-design-section")).toBe("colors");
  });
});
