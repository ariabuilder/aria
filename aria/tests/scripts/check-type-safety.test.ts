import { describe, expect, it } from "vitest";

import { inspectTypeSafetySource } from "../../scripts/check-type-safety";

describe("type-safety boundary", () => {
  it("accepts unknown at an untrusted boundary", () => {
    expect(
      inspectTypeSafetySource("fixture.ts", "const input: unknown = value;"),
    ).toEqual([]);
  });

  it.each([
    ["type annotation", "const input: any = value;", "explicit any"],
    ["type assertion", "value as any;", "explicit any"],
    ["generic argument", "Promise<any>;", "explicit any"],
    ["schema escape hatch", "z.any();", "z.any()"],
    ["ignore directive", "// @ts-ignore\nvalue();", "@ts-ignore"],
    ["nocheck directive", "// @ts-nocheck\nvalue();", "@ts-nocheck"],
  ])("rejects %s", (_label, source, expectedMessage) => {
    expect(inspectTypeSafetySource("fixture.ts", source)).toEqual([
      expect.objectContaining({ message: expect.stringContaining(expectedMessage) }),
    ]);
  });

  it("checks Vue script blocks without treating templates as TypeScript", () => {
    const source = `<script setup lang="ts">\nconst value: any = 1;\n</script>\n<template><div /></template>`;
    expect(inspectTypeSafetySource("Fixture.vue", source)).toEqual([
      expect.objectContaining({ line: 2, message: "explicit any is forbidden" }),
    ]);
  });

  it("checks Astro frontmatter", () => {
    const source = `---\nconst value = z.any();\n---\n<div />`;
    expect(inspectTypeSafetySource("Fixture.astro", source)).toEqual([
      expect.objectContaining({ line: 2, message: expect.stringContaining("z.any()") }),
    ]);
  });
});
