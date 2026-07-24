import { describe, expect, it } from "vitest";

import {
  CANVAS_DISABLED_ATTRIBUTE,
  normalizeCanvasAttributeProps,
} from "../../../admin/features/Stage/utils/canvasRenderAttributes";

describe("canvasRenderAttributes", () => {
  it("keeps non-button props unchanged", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "Container" },
        { disabled: true, id: "hero" },
      ),
    ).toEqual({
      disabled: true,
      id: "hero",
    });
  });

  it("replaces native disabled with a stage-only attribute for buttons", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "Button" },
        { disabled: true, href: "/pricing" },
      ),
    ).toEqual({
      href: "/pricing",
      [CANVAS_DISABLED_ATTRIBUTE]: "true",
    });
  });

  it("clears the stage-only disabled attribute when buttons become enabled", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "Button" },
        { disabled: false, [CANVAS_DISABLED_ATTRIBUTE]: "true" },
      ),
    ).toEqual({
      [CANVAS_DISABLED_ATTRIBUTE]: undefined,
    });
  });
});
