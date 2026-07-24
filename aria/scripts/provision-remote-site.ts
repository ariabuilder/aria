#!/usr/bin/env -S npx tsx

import { execFileSync } from "child_process";

import { resolveSiteUrl } from "./bootstrap-remote-storage";

const claimUrl = resolveSiteUrl();

function run(command: string, args: string[]): void {
  execFileSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
}

console.log("🔧 Provisioning remote Aria site...\n");

run("npx", ["tsx", "aria/scripts/apply-d1-migrations.ts", "--remote"]);

console.log("\n✅ Remote Aria provisioning completed.");
if (claimUrl) {
  console.log(
    `🔐 Next step: create the first admin and complete first launch at ${claimUrl}`,
  );
} else {
  console.log(
    "🔐 Next step: create the first admin and complete first launch at /admin/setup on the deployed site.",
  );
}
