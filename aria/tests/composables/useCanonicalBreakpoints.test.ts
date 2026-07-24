import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBreakpointsMock, saveBreakpointsMock } = vi.hoisted(() => ({
  getBreakpointsMock: vi.fn(),
  saveBreakpointsMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    designSystem: {
      getBreakpoints: getBreakpointsMock,
      saveBreakpoints: saveBreakpointsMock,
    },
  },
}));

function createBreakpointFixtures() {
  return [
    {
      id: "base",
      label: "Desktop",
      icon: "Monitor",
      minWidth: 1280,
      canvasWidth: 1440,
      enabled: true,
      isDefault: true,
      order: 0,
    },
    {
      id: "laptop",
      label: "Laptop",
      icon: "Laptop",
      minWidth: 1024,
      canvasWidth: 1024,
      enabled: true,
      isDefault: true,
      order: 1,
    },
    {
      id: "tablet",
      label: "Tablet",
      icon: "Tablet",
      minWidth: 768,
      canvasWidth: 768,
      enabled: true,
      isDefault: true,
      order: 2,
    },
    {
      id: "mobile",
      label: "Mobile",
      icon: "Smartphone",
      minWidth: 0,
      canvasWidth: 375,
      enabled: true,
      isDefault: true,
      order: 3,
    },
  ];
}

describe("useCanonicalBreakpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    getBreakpointsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          breakpoints: createBreakpointFixtures(),
        },
      },
      error: null,
    });
  });

  it("loads breakpoint data from Astro action transport envelopes", async () => {
    const { useCanonicalBreakpoints } =
      await import("../../admin/composables/useCanonicalBreakpoints");

    const breakpoints = useCanonicalBreakpoints();
    await breakpoints.loadBreakpoints();

    expect(getBreakpointsMock).toHaveBeenCalledWith({});
    expect(breakpoints.breakpoints.value.map((item) => item.id)).toEqual([
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
  });

  it("normalizes legacy base breakpoint metadata to Desktop defaults", async () => {
    getBreakpointsMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          breakpoints: [
            {
              id: "base",
              label: "Base",
              icon: "Smartphone",
              minWidth: 1280,
              canvasWidth: null,
              enabled: true,
              isDefault: true,
              order: 0,
            },
            ...createBreakpointFixtures().slice(1),
          ],
        },
      },
      error: null,
    });

    const { useCanonicalBreakpoints } =
      await import("../../admin/composables/useCanonicalBreakpoints");

    const breakpoints = useCanonicalBreakpoints();
    await breakpoints.loadBreakpoints();

    expect(breakpoints.breakpoints.value[0]).toMatchObject({
      id: "base",
      label: "Desktop",
      icon: "Monitor",
      canvasWidth: 1440,
    });
  });

  it("saves breakpoint changes from Astro action transport envelopes", async () => {
    const savedBreakpoints = createBreakpointFixtures().map((breakpoint) =>
      breakpoint.id === "mobile"
        ? { ...breakpoint, enabled: false }
        : breakpoint,
    );

    saveBreakpointsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          breakpoints: savedBreakpoints,
          styleRefresh: {
            success: true,
            framework: "custom",
          },
        },
      },
      error: null,
    });

    const { useCanonicalBreakpoints } =
      await import("../../admin/composables/useCanonicalBreakpoints");

    const breakpoints = useCanonicalBreakpoints();
    await breakpoints.loadBreakpoints();
    await breakpoints.toggleBreakpoint("mobile");

    expect(saveBreakpointsMock).toHaveBeenCalledWith({
      breakpoints: expect.arrayContaining(savedBreakpoints),
    });
    expect(
      breakpoints.breakpoints.value.find((item) => item.id === "mobile")
        ?.enabled,
    ).toBe(false);
  });

  it("sorts enabled breakpoints largest to smallest for viewport selectors", async () => {
    getBreakpointsMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          breakpoints: [
            {
              id: "base",
              label: "Desktop",
              icon: "Monitor",
              minWidth: 1280,
              canvasWidth: 1440,
              enabled: true,
              isDefault: true,
              order: 0,
            },
            {
              id: "testing",
              label: "Testing",
              icon: "Monitor",
              minWidth: 2400,
              canvasWidth: 2400,
              enabled: true,
              isDefault: false,
              order: 1,
            },
            {
              id: "laptop",
              label: "Laptop",
              icon: "Laptop",
              minWidth: 1024,
              canvasWidth: 1024,
              enabled: true,
              isDefault: true,
              order: 2,
            },
          ],
        },
      },
      error: null,
    });

    const { useCanonicalBreakpoints } =
      await import("../../admin/composables/useCanonicalBreakpoints");

    const breakpoints = useCanonicalBreakpoints();
    await breakpoints.loadBreakpoints();

    expect(breakpoints.enabledBreakpoints.value.map((item) => item.id)).toEqual([
      "testing",
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
    expect(breakpoints.activeViewports.value.map((item) => item.id)).toEqual([
      "testing",
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
  });
});
