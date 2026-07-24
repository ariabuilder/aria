import { describe, expect, it } from "vitest";
import {
  MediaGroupSchema,
  MediaGroupingStateSchema,
} from "../../../lib/schemas/mediaGrouping";

describe("mediaGrouping schema", () => {
  it("validates a grouping state with groups and assignments", () => {
    const parsed = MediaGroupingStateSchema.parse({
      groups: [{ id: "grp-1", name: "Brand Assets" }],
      assignments: { "hero.jpg": "grp-1" },
    });

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.assignments["hero.jpg"]).toBe("grp-1");
  });

  it("rejects empty group names", () => {
    expect(() =>
      MediaGroupSchema.parse({ id: "grp-1", name: "   " }),
    ).toThrow();
  });
});
