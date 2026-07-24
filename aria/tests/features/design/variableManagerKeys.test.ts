import { describe, expect, it } from "vitest";

import { createSequentialDuplicateKey } from "../../../admin/features/Design/lib/variableManagerKeys";

describe("variableManagerKeys", () => {
  it("appends -1 for the first duplicate", () => {
    expect(
      createSequentialDuplicateKey("brand-primary", ["brand-primary"]),
    ).toBe("brand-primary-1");
  });

  it("finds the next available numeric suffix", () => {
    expect(
      createSequentialDuplicateKey("brand-primary", [
        "brand-primary",
        "brand-primary-1",
        "brand-primary-2",
      ]),
    ).toBe("brand-primary-3");
  });

  it("continues the sequence even when duplicating an already-suffixed key", () => {
    expect(
      createSequentialDuplicateKey("brand-primary-2", [
        "brand-primary",
        "brand-primary-1",
        "brand-primary-2",
      ]),
    ).toBe("brand-primary-3");
  });
});
