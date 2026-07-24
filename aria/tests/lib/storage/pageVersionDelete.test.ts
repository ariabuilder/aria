import { describe, expect, it } from "vitest";

import {
  assertPageVersionDeletable,
  collectProtectedPageVersions,
} from "../../../lib/storage/pageVersionDelete";

describe("pageVersionDelete helpers", () => {
  it("collects normalized protected version ids", () => {
    const protectedSet = collectProtectedPageVersions({
      draftVersion: "v100",
      publishedVersion: "200",
      currentVersion: "300",
    });

    expect([...protectedSet].sort()).toEqual(["100", "200", "300"]);
  });

  it("allows deleting a version that is not pinned when multiple exist", () => {
    const normalized = assertPageVersionDeletable({
      version: "150",
      pins: {
        draftVersion: "300",
        publishedVersion: null,
        currentVersion: "300",
      },
      existingVersions: ["300", "150", "100"],
    });

    expect(normalized).toBe("150");
  });
});
