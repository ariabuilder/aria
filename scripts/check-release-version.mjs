import { readFile } from "node:fs/promises";

const tag = process.argv[2];
const stableTagPattern = /^v\d+\.\d+\.\d+$/;

if (!tag) {
  console.error("Usage: npm run release:check-version -- vX.Y.Z");
  process.exit(1);
}

if (!stableTagPattern.test(tag)) {
  console.error(`Release tag "${tag}" must use the stable vX.Y.Z format.`);
  process.exit(1);
}

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  console.error(
    `Release tag "${tag}" does not match package.json version "${packageJson.version}". Expected "${expectedTag}".`,
  );
  process.exit(1);
}

console.log(`Release tag ${tag} matches package.json.`);
