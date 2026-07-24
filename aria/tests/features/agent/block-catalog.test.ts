import { describe, expect, it } from "vitest";
import {
  BLOCK_CATALOG,
  BlockCatalogSchema,
  ElementCapabilitiesSchema,
  getBlockCatalogSummary,
  listElementTypes,
} from "../../../admin/features/Agent/lib/manifest/blockCatalog";

describe("blockCatalog", () => {
  it("parses static catalog with Zod", () => {
    expect(() => BlockCatalogSchema.parse(BLOCK_CATALOG)).not.toThrow();
  });

  it("includes section and heading primitives", () => {
    const types = listElementTypes().map((entry) => entry.type);
    expect(types).toContain("section");
    expect(types).toContain("heading");
    expect(types).toContain("text");
  });

  it("every entry has valid capabilities", () => {
    for (const entry of BLOCK_CATALOG) {
      expect(() =>
        ElementCapabilitiesSchema.parse(entry.capabilities),
      ).not.toThrow();
    }
  });

  it("heading has text and level props", () => {
    const heading = BLOCK_CATALOG.find((e) => e.id === "heading")!;
    expect(heading.props?.text?.required).toBe(true);
    expect(heading.props?.level?.constraints?.min).toBe(1);
    expect(heading.props?.level?.constraints?.max).toBe(6);
  });

  it("code does not have motion capability", () => {
    const code = BLOCK_CATALOG.find((e) => e.id === "code")!;
    expect(code.capabilities?.motion).toBe(false);
  });

  it("list items prop warns against manual children", () => {
    const list = BLOCK_CATALOG.find((e) => e.id === "list")!;
    expect(list.props?.items?.description).toContain(
      "Do NOT add children manually",
    );
  });

  it("builds summary string for system prompt", () => {
    const summary = getBlockCatalogSummary();
    expect(summary).toContain("Containers:");
    expect(summary).toContain("Section");
  });
});
