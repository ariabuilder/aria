import { describe, expect, it } from "vitest";

import { useSlotRendering } from "../../admin/composables/useSlotRendering";

describe("useSlotRendering", () => {
  it("does not hardcode a white body background outside slot mode", () => {
    const { ensureSlotStyles } = useSlotRendering();
    const doc = document.implementation.createHTMLDocument("slot-styles");

    ensureSlotStyles(doc.head);

    const css =
      doc.head.querySelector("style[data-aria-slot-styles]")?.textContent ?? "";

    expect(css).not.toContain("body {\n        background-color: #ffffff;");
    expect(css).toContain("body.show-slots {");
    expect(css).toContain("background-color: #ffffff;");
  });
});
