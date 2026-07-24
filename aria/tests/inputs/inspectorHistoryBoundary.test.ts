import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const INPUTS_DIR = join(process.cwd(), "aria/admin/features/Inspector/inputs");

const SKIPPED_FILES = new Set([
  "BaseProperty.vue",
  "ResponsivePropertyEditor.vue",
  "index.ts",
]);

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\buseHistory\b/,
    reason: "must not call useHistory directly from inspector inputs",
  },
  {
    pattern: /\brecordStateSnapshot(?:Advanced)?\b/,
    reason: "must not record history snapshots directly from inspector inputs",
  },
  {
    pattern: /\bupdateSelectedNode(?:Props|Styles|A11y)\b/,
    reason:
      "must not mutate selected node state directly from inspector inputs",
  },
  {
    pattern: /actions\.(?:nodes|pages|layouts|components|crud|core|save)\b/,
    reason:
      "must not call content mutation actions directly from inspector inputs",
  },
];

describe("inspector history boundary", () => {
  it("keeps inspector inputs on history-backed mutation entry points", () => {
    const files = readdirSync(INPUTS_DIR)
      .filter((fileName) => fileName.endsWith(".vue"))
      .filter((fileName) => !SKIPPED_FILES.has(fileName))
      .sort();

    const violations: string[] = [];

    for (const fileName of files) {
      const content = readFileSync(join(INPUTS_DIR, fileName), "utf8");

      for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${fileName}: ${reason}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
