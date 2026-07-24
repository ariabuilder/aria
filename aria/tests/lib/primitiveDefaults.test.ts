import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const primitivesDir = join(
  process.cwd(),
  "aria/admin/features/Blocks/elements/primitives",
);

describe("primitive defaults", () => {
  it("do not seed legacy class fields in primitive element definitions", () => {
    const primitiveFiles = readdirSync(primitivesDir).filter((fileName) =>
      fileName.endsWith(".vue"),
    );

    for (const fileName of primitiveFiles) {
      const source = readFileSync(join(primitivesDir, fileName), "utf8");

      expect(source).not.toContain("className:");
      expect(source).not.toContain("classNames:");
      expect(source).not.toContain("customClasses:");
    }
  });
});
