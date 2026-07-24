import { chmod, mkdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

type PackageJson = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const rootDir = resolve(import.meta.dirname, "../..");
const packageJson = JSON.parse(
  await readFile(resolve(rootDir, "package.json"), "utf8"),
) as PackageJson;

const dependencyNames = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
]);

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...dependencyNames,
  ...[...dependencyNames].map((name) => `${name}/*`),
];

const outfile = resolve(rootDir, "dist/cli/main.js");

await mkdir(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(rootDir, "aria/cli/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external,
  logLevel: "info",
  sourcemap: false,
});

await chmod(outfile, 0o755);

console.log(`Built ${outfile}`);
