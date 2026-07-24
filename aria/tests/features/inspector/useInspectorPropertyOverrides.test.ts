import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const enabledBreakpointsRef = ref([
  {
    id: "testing",
    label: "Testing",
    icon: "Monitor",
    minWidth: 2400,
    canvasWidth: 2400,
    enabled: true,
    order: 1,
  },
  {
    id: "base",
    label: "Desktop",
    icon: "Monitor",
    minWidth: 1440,
    canvasWidth: 1440,
    enabled: true,
    order: 0,
  },
  {
    id: "laptop",
    label: "Laptop",
    icon: "Laptop",
    minWidth: 1024,
    canvasWidth: 1024,
    enabled: true,
    order: 2,
  },
  {
    id: "tablet",
    label: "Tablet",
    icon: "Tablet",
    minWidth: 768,
    canvasWidth: 768,
    enabled: true,
    order: 3,
  },
]);

vi.mock("../../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    enabledBreakpoints: enabledBreakpointsRef,
    activeBreakpoints: ref([]),
  }),
}));

import { useInspectorPropertyOverrides } from "../../../admin/features/Inspector/composables/useInspectorPropertyOverrides";

describe("useInspectorPropertyOverrides", () => {
  it("orders override chips largest to smallest by effective width", () => {
    const overrides = useInspectorPropertyOverrides({
      propertyKeys: ["backgroundColor"],
      currentBreakpoint: ref("base"),
      styleTarget: {
        getResponsiveStyleMap: () => ({
          base: "#993939",
          testing: "var(--secondary-800)",
          laptop: "var(--warning-700)",
          tablet: "#0c7521e8",
        }),
        clearStyleProperties: vi.fn(async () => true),
      },
    });

    expect(overrides.overrideBreakpointIds.value).toEqual([
      "testing",
      "base",
      "laptop",
      "tablet",
    ]);
    expect(overrides.overrideBreakpoints.value.map((item) => item.id)).toEqual([
      "testing",
      "base",
      "laptop",
      "tablet",
    ]);
  });

  it("sorts unknown breakpoint ids by effective width when appended", () => {
    enabledBreakpointsRef.value = [
      {
        id: "base",
        label: "Desktop",
        icon: "Monitor",
        minWidth: 1440,
        canvasWidth: 1440,
        enabled: true,
        order: 0,
      },
      {
        id: "tablet",
        label: "Tablet",
        icon: "Tablet",
        minWidth: 768,
        canvasWidth: 768,
        enabled: true,
        order: 3,
      },
    ];

    const overrides = useInspectorPropertyOverrides({
      propertyKeys: ["backgroundColor"],
      currentBreakpoint: ref("base"),
      styleTarget: {
        getResponsiveStyleMap: () => ({
          base: "#993939",
          customWide: "var(--secondary-800)",
          tablet: "#0c7521e8",
        }),
        clearStyleProperties: vi.fn(async () => true),
      },
    });

    expect(overrides.overrideBreakpointIds.value).toEqual([
      "base",
      "tablet",
      "customWide",
    ]);
  });
});
