import { describe, expect, it } from "vitest";

import { buildVersionDisplayNumbers } from "../../admin/features/Studio/pages/utils/versionHistoryFormatters";

describe("buildVersionDisplayNumbers", () => {
  it("assigns v1 to a single version", () => {
    const map = buildVersionDisplayNumbers([
      { version: "1700000001000", createdAt: "2024-01-01T00:00:00.000Z" },
    ]);

    expect(map.get("1700000001000")).toBe(1);
  });

  it("assigns sequential numbers oldest to newest by createdAt", () => {
    const map = buildVersionDisplayNumbers([
      { version: "1700000003000", createdAt: "2024-01-03T00:00:00.000Z" },
      { version: "1700000001000", createdAt: "2024-01-01T00:00:00.000Z" },
      { version: "1700000002000", createdAt: "2024-01-02T00:00:00.000Z" },
    ]);

    expect(map.get("1700000001000")).toBe(1);
    expect(map.get("1700000002000")).toBe(2);
    expect(map.get("1700000003000")).toBe(3);
  });

  it("tie-breaks equal createdAt by version string", () => {
    const map = buildVersionDisplayNumbers([
      { version: "2000", createdAt: "2024-01-01T00:00:00.000Z" },
      { version: "1000", createdAt: "2024-01-01T00:00:00.000Z" },
    ]);

    expect(map.get("1000")).toBe(1);
    expect(map.get("2000")).toBe(2);
  });
});
