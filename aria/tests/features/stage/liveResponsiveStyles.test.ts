import { describe, expect, it } from "vitest";

import {
  canvasStyleUpdateToStyleMap,
  mergeCanvasStyleUpdateIntoStyleMap,
  mergeNodeStylesWithLiveOverrides,
} from "../../../admin/features/Stage/utils/liveResponsiveStyles";

describe("canvasStyleUpdateToStyleMap", () => {
  it("converts breakpoint-grouped updates into responsive property maps", () => {
    expect(
      canvasStyleUpdateToStyleMap({
        tablet: {
          fontFamily: "DM Sans",
          textTransform: "none",
        },
        desktop: {
          width: "100%",
        },
      }),
    ).toEqual({
      fontFamily: {
        tablet: "DM Sans",
      },
      textTransform: {
        tablet: "none",
      },
      width: {
        desktop: "100%",
      },
    });
  });

  it("merges incremental updates without dropping prior properties", () => {
    expect(
      mergeCanvasStyleUpdateIntoStyleMap(
        {
          fontFamily: {
            base: "Inter",
            tablet: "DM Sans",
          },
        },
        {
          base: {
            fontSize: "40px",
          },
          tablet: {
            textTransform: "uppercase",
          },
        },
      ),
    ).toEqual({
      fontFamily: {
        base: "Inter",
        tablet: "DM Sans",
      },
      fontSize: {
        base: "40px",
      },
      textTransform: {
        tablet: "uppercase",
      },
    });
  });

  it("removes breakpoint entries when a live update clears them", () => {
    expect(
      mergeCanvasStyleUpdateIntoStyleMap(
        {
          fontFamily: {
            base: "Inter",
          },
          fontSize: {
            base: "40px",
          },
        },
        {
          base: {
            fontFamily: undefined,
          },
        },
      ),
    ).toEqual({
      fontSize: {
        base: "40px",
      },
    });
  });
});

describe("mergeNodeStylesWithLiveOverrides", () => {
  it("clears stale downstream breakpoint overrides from node styles", () => {
    expect(
      mergeNodeStylesWithLiveOverrides(
        {
          listStyleType: {
            base: "disc",
            tablet: "disc",
          },
        },
        {
          listStyleType: {
            base: "none",
            tablet: undefined,
          },
        },
      ),
    ).toEqual({
      listStyleType: {
        base: "none",
      },
    });
  });

  it("keeps untouched node properties when live updates target another property", () => {
    expect(
      mergeNodeStylesWithLiveOverrides(
        {
          listStyleType: {
            base: "disc",
          },
          listStylePosition: {
            base: "outside",
          },
        },
        {
          listStyleType: {
            base: "none",
          },
        },
      ),
    ).toEqual({
      listStyleType: {
        base: "none",
      },
      listStylePosition: {
        base: "outside",
      },
    });
  });
});
