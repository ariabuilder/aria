import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const runtimeRoots = [path.join(root, "aria", "lib"), path.join(root, "src")];
const forbidden = ["@iconify-json/", "@iconify/tools", "localIconRegistry"];

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? files(target) : [target];
    }),
  );
  return nested.flat();
}

const candidates = (await Promise.all(runtimeRoots.map(files)))
  .flat()
  .filter((file) => /\.(?:[cm]?[jt]s|astro|vue)$/u.test(file));
const violations: string[] = [];

for (const file of candidates) {
  const source = await readFile(file, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      violations.push(`${path.relative(root, file)} reaches ${token}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Icon Worker boundary violated:\n- ${violations.join("\n- ")}`);
}

console.log(`Icon Worker boundary passed (${candidates.length} runtime source files checked).`);
