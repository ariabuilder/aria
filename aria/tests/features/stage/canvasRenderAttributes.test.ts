import { describe, expect, it } from "vitest";

import { normalizeCanvasAttributeProps } from "../../../admin/features/Stage/utils/canvasRenderAttributes";

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

  it("preserves native disabled state for buttons", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "Button" },
        { disabled: true, href: "/pricing" },
      ),
    ).toEqual({
      disabled: true,
      href: "/pricing",
    });
  });

  it("preserves an explicit enabled state without introducing editor attributes", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "Button" },
        { disabled: false },
      ),
    ).toEqual({
      disabled: false,
    });
  });

  it("strips renderer-consumed list semantics from Stage attributes", () => {
    expect(
      normalizeCanvasAttributeProps(
        { type: "List" },
        { element: "dl", ordered: true, items: ["legacy"] },
      ),
    ).toEqual({});
    expect(
      normalizeCanvasAttributeProps(
        { type: "ListItem" },
        { element: "dt", title: "Term" },
      ),
    ).toEqual({ title: "Term" });
  });
});
