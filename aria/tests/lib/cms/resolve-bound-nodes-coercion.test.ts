import { describe, expect, it } from "vitest";

import { coerceCmsBindingValueForTextProp } from "../../../lib/cms/resolveBoundNodes";

describe("coerceCmsBindingValueForTextProp", () => {
  it("coerces hydrated reference objects to title for text props", () => {
    expect(
      coerceCmsBindingValueForTextProp("text", {
        id: "author-1",
        title: "Michael Chen",
      }),
    ).toBe("Michael Chen");
  });

  it("leaves non-text props unchanged", () => {
    const author = { id: "author-1", title: "Michael Chen" };
    expect(coerceCmsBindingValueForTextProp("avatar", author)).toBe(author);
  });

  it("leaves primitives unchanged", () => {
    expect(coerceCmsBindingValueForTextProp("text", "Hello")).toBe("Hello");
  });

  it("coerces content, label, and title prop names", () => {
    const value = { title: "Post headline" };
    expect(coerceCmsBindingValueForTextProp("content", value)).toBe(
      "Post headline",
    );
    expect(coerceCmsBindingValueForTextProp("label", value)).toBe(
      "Post headline",
    );
    expect(coerceCmsBindingValueForTextProp("title", value)).toBe(
      "Post headline",
    );
  });
});
