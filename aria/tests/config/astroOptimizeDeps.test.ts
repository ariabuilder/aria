import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const astroConfigSource = readFileSync(resolve("astro.config.ts"), "utf8");

describe("Astro SSR dependency optimization", () => {
  it("eagerly includes the stable route-cache dependency", () => {
    const includesMatch = astroConfigSource.match(
      /const SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES = \[([\s\S]*?)\] as const;/,
    );

    expect(includesMatch?.[1]).toContain('"fast-xml-parser"');
    expect(includesMatch?.[1]).not.toContain('"@unocss/');
  });

  it.each([
    "@unocss/core",
    "@unocss/extractor-arbitrary-variants",
    "@unocss/preset-mini",
    "@unocss/preset-typography",
    "@unocss/preset-wind3",
    "@unocss/rule-utils",
    "@unocss/transformer-directives",
    "@unocss/transformer-variant-group",
  ])("source-loads save/publish compiler dependency %s", (dependency) => {
    const excludesMatch = astroConfigSource.match(
      /const SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES = \[([\s\S]*?)\] as const;/,
    );

    expect(excludesMatch?.[1]).toContain(`"${dependency}"`);
  });

  it("applies both policies at every optimizer boundary", () => {
    const includeSpreadCount = astroConfigSource.match(
      /\.\.\.SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES/g,
    )?.length;
    const excludeSpreadCount = astroConfigSource.match(
      /\.\.\.SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES/g,
    )?.length;

    expect(includeSpreadCount).toBe(3);
    expect(excludeSpreadCount).toBe(3);
  });
});
