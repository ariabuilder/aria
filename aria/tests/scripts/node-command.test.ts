import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  isMainModule,
  resolvePackageBin,
  runPackageBin,
} from "../../scripts/lib/node-command";
import { withTemporarySqlFile } from "../../scripts/lib/wrangler-command";

const temporaryDirectories: string[] = [];

async function fakePackage(input: {
  bin: string | Record<string, string>;
  name: string;
  root: string;
  source?: string;
}): Promise<string> {
  const packageDirectory = join(
    input.root,
    "node_modules",
    ...input.name.split("/"),
  );
  const relativeBin =
    typeof input.bin === "string" ? input.bin : Object.values(input.bin)[0]!;
  const binPath = join(packageDirectory, relativeBin);
  await mkdir(dirname(binPath), { recursive: true });
  await writeFile(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: input.name, bin: input.bin, type: "module" }),
  );
  await writeFile(
    binPath,
    input.source ?? "console.log(JSON.stringify(process.argv.slice(2)))",
  );
  return binPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Payload-style Node command runner", () => {
  it("resolves string and named package bins from their manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "aria-command-test-"));
    temporaryDirectories.push(root);
    const stringBin = await fakePackage({
      bin: "bin/string.mjs",
      name: "string-tool",
      root,
    });
    const namedBin = await fakePackage({
      bin: { named: "dist/named.mjs" },
      name: "@aria-test/named-tool",
      root,
    });

    expect(
      await realpath(resolvePackageBin("string-tool", "string-tool", root)),
    ).toBe(await realpath(stringBin));
    expect(
      await realpath(resolvePackageBin("@aria-test/named-tool", "named", root)),
    ).toBe(await realpath(namedBin));
  });

  it("preserves spaces and shell metacharacters without shell parsing", async () => {
    const root = await mkdtemp(join(tmpdir(), "aria command test "));
    temporaryDirectories.push(root);
    await fakePackage({
      bin: { fake: "bin/fake.mjs" },
      name: "fake-tool",
      root,
      source:
        "console.log(JSON.stringify({args: process.argv.slice(2), value: process.env.ARIA_TEST_VALUE}))",
    });
    const args = ["space value", "&", "%PATH%", "$HOME", '"quoted"'];
    const result = await runPackageBin("fake-tool", "fake", args, {
      cwd: root,
      env: { ARIA_TEST_VALUE: "value with spaces & symbols" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(JSON.parse(result.stdout)).toEqual({
      args,
      value: "value with spaces & symbols",
    });
  });

  it("reports missing installs with an actionable npm message", () => {
    expect(() =>
      resolvePackageBin("definitely-not-an-aria-package", "missing"),
    ).toThrow("Run `npm install`");
  });

  it("normalizes Windows casing when detecting a main module", () => {
    const modulePath = fileURLToPath(import.meta.url);
    expect(isMainModule(import.meta.url, modulePath)).toBe(true);
    expect(
      isMainModule(
        pathToFileURL(modulePath).href,
        modulePath.toUpperCase(),
        "win32",
      ),
    ).toBe(true);
  });

  it("writes exact SQL to a temporary file and always removes it", async () => {
    const sql = "SELECT '$HOME', '%PATH%', 'a & b';";
    let sqlPath = "";
    await withTemporarySqlFile(sql, async (path) => {
      sqlPath = path;
      expect(await readFile(path, "utf8")).toBe(sql);
    });
    await expect(readFile(sqlPath, "utf8")).rejects.toThrow();
  });
});
