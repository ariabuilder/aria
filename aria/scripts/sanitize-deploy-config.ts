import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// @cloudflare/vite-plugin dumps wrangler's normalized config into
// dist/server/wrangler.json, including "legacy_env". Wrangler >= 4.113
// refuses to read that field back. Removing it does not change deploy
// behavior — the config defines no environments, and per wrangler's own
// error message the new default matches legacy_env = true.
const deployConfigPath = path.join(
  process.cwd(),
  "dist",
  "server",
  "wrangler.json",
);

const rawConfig = await readFile(deployConfigPath, "utf8");
const parsed: unknown = JSON.parse(rawConfig);
if (
  typeof parsed === "object" &&
  parsed !== null &&
  "legacy_env" in parsed
) {
  delete (parsed as Record<string, unknown>).legacy_env;
  await writeFile(deployConfigPath, JSON.stringify(parsed), "utf8");
  console.log(
    'Removed unsupported "legacy_env" field from dist/server/wrangler.json.',
  );
}
