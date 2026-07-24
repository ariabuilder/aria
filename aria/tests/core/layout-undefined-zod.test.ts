import { describe, expect, it } from "vitest";
import { LayoutDSLSchema } from "../../lib/schemas/nodes";
import { JsonObjectSchema, toStorableJsonObject } from "../../lib/schemas/json";

const candidate = {
  id: "two-sidebar",
  name: "Two Sidebars",
  slug: undefined,
  order: undefined,
  nodes: [],
  slots: [],
  metadata: undefined,
  regions: undefined,
  tags: undefined,
  categories: undefined,
  layoutType: undefined,
  author: undefined,
  contributors: undefined,
  usage: undefined,
  version: undefined,
  createdAt: undefined,
  updatedAt: undefined,
};

describe("layout undefined fields", () => {
  it("LayoutDSLSchema accepts omitted-style undefined keys", () => {
    expect(LayoutDSLSchema.safeParse(candidate).success).toBe(true);
  });

  it("LayoutDSLSchema.parse output still fails JsonObjectSchema when undefined keys persist", () => {
    const parsed = LayoutDSLSchema.parse(candidate);
    const json = JsonObjectSchema.safeParse(parsed);
    expect(json.success).toBe(false);
  });

  it("JsonObjectSchema rejects undefined values at layout keys", () => {
    const result = JsonObjectSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toContain("slug");
    }
  });

  it("toStorableJsonObject strips undefined before validation", () => {
    const parsed = LayoutDSLSchema.parse(candidate);
    const stored = toStorableJsonObject(parsed);
    expect(stored).not.toHaveProperty("slug");
    expect(JsonObjectSchema.safeParse(stored).success).toBe(true);
  });
});
