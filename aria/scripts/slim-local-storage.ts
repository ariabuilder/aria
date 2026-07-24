#!/usr/bin/env node
/**
 * Slim local aria/storage/aria. db for dev: - delete default test
 * pages - prune page/layout/component version history to keepLatest=1 - clear.
 */

import {
  formatSlimLocalStorageReport,
  parseSlimLocalStorageArgs,
  runSlimLocalStorage,
} from "../lib/storage/slimLocalStorage";

const { apply, keepPageIds } = parseSlimLocalStorageArgs(process.argv.slice(2));

try {
  const report = await runSlimLocalStorage({ apply, keepPageIds });
  console.log(formatSlimLocalStorageReport(report));

  if (report.dryRun) {
    console.log("\nRe-run with --apply to write changes.");
  }
} catch (error) {
  console.error("\nFailed to slim local storage.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
