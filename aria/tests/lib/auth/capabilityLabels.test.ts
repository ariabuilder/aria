import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LABELS,
  CapabilitySchema,
  formatCapabilityLabel,
} from "../../../lib/auth/types";

describe("CAPABILITY_LABELS", () => {
  it("includes a non-empty label for every capability", () => {
    for (const capability of CapabilitySchema.options) {
      expect(CAPABILITY_LABELS[capability]).toBeDefined();
      expect(CAPABILITY_LABELS[capability].trim().length).toBeGreaterThan(0);
    }
  });

  it("formatCapabilityLabel returns the mapped label", () => {
    expect(formatCapabilityLabel("editPageContent")).toBe("Edit page content");
  });
});
