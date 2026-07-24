import { describe, expect, it } from "vitest";

import { getVersionAuthorshipLabel } from "../../admin/features/Studio/pages/utils/versionAuthorshipLabels";

describe("getVersionAuthorshipLabel", () => {
  it("labels the oldest entry (last index) as Created by", () => {
    expect(getVersionAuthorshipLabel(2, 3)).toBe("Created by");
    expect(getVersionAuthorshipLabel(0, 1)).toBe("Created by");
  });

  it("labels newer entries as Updated by", () => {
    expect(getVersionAuthorshipLabel(0, 3)).toBe("Updated by");
    expect(getVersionAuthorshipLabel(1, 3)).toBe("Updated by");
  });

  it("returns Updated by when total is zero", () => {
    expect(getVersionAuthorshipLabel(0, 0)).toBe("Updated by");
  });
});
