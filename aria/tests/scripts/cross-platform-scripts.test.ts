import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  scripts?: Record<string, string>;
};

describe("cross-platform package scripts", () => {
  it("contains no shell-specific lifecycle syntax", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as PackageManifest;
    const forbidden = [
      {
        label: "inline environment assignment",
        pattern: /(?:^|\s)[A-Z][A-Z0-9_]*=/u,
      },
      { label: "POSIX removal", pattern: /\brm\s+-rf\b/u },
      { label: "npx wrapper", pattern: /(?:^|\s)npx(?:\s|$)/u },
      { label: "hard-coded package bin", pattern: /node_modules[\\/]\.bin/u },
      { label: "shell chaining", pattern: /&&|\|\||;/u },
      { label: "POSIX environment expansion", pattern: /\$[A-Z_][A-Z0-9_]*/u },
    ];
    const violations = Object.entries(manifest.scripts ?? {}).flatMap(
      ([name, command]) =>
        forbidden.flatMap(({ label, pattern }) =>
          pattern.test(command) ? [`${name}: ${label}`] : [],
        ),
    );

    expect(violations).toEqual([]);
  });
});
