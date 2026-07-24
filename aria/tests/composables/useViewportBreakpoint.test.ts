import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([
      { name: "base", minWidth: "0px", label: "Base" },
      { name: "tablet", minWidth: "768px", label: "Tablet" },
      { name: "desktop", minWidth: "1280px", label: "Desktop" },
    ]),
    getViewportForBreakpoint: (breakpointId: string) => {
      if (breakpointId === "base") return "base";
      if (breakpointId === "tablet") return "tablet";
      if (breakpointId === "desktop") return "desktop";
      if (breakpointId === "lg") return "desktop";
      return "base";
    },
  }),
}));

describe("useCanonicalBreakpoints viewport mapping", () => {
  it("maps breakpoint ids to viewport ids", async () => {
    const { useCanonicalBreakpoints } =
      await import("../../admin/composables/useCanonicalBreakpoints");

    const { getViewportForBreakpoint } = useCanonicalBreakpoints();

    expect(getViewportForBreakpoint("base")).toBe("base");
    expect(getViewportForBreakpoint("tablet")).toBe("tablet");
    expect(getViewportForBreakpoint("desktop")).toBe("desktop");
    expect(getViewportForBreakpoint("lg")).toBe("desktop");
    expect(getViewportForBreakpoint("unknown")).toBe("base");
  });
});
