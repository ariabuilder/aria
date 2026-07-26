import { resolveSiteUrl } from "./bootstrap-remote-storage";
import { applyD1Migrations } from "./apply-d1-migrations";
import { isMainModule } from "./lib/node-command";

export async function provisionRemoteSite(): Promise<void> {
  const claimUrl = resolveSiteUrl();
  console.log("🔧 Provisioning remote Aria site...\n");
  await applyD1Migrations("remote");
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
}

if (isMainModule(import.meta.url)) {
  await provisionRemoteSite();
}
