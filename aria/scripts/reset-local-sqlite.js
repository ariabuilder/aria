#!/usr/bin/env node

import { rmSync } from "fs";
import { resolve } from "path";

const localSqlitePath = resolve(process.cwd(), "aria/storage/aria.db");
const localWranglerD1Path = resolve(
  process.cwd(),
  ".wrangler/state/v3/d1",
);

try {
  rmSync(localSqlitePath, { force: true });
  rmSync(localWranglerD1Path, { recursive: true, force: true });
  console.log(`Deleted ${localSqlitePath}`);
  console.log(`Deleted ${localWranglerD1Path}`);
  console.log(
    "Run `npm run db:migrate:local` before `npm run dev:edge` to recreate the local D1 baseline.",
  );
} catch (error) {
  console.error("Failed to reset local SQLite/D1 storage.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
