import { readCloudflareAccountIdFromEnvironment } from "../../lib/cloudflare/account";
import { runWrangler } from "./wrangler-command";

export async function resolveCloudflareAccountId(): Promise<string> {
  const fromEnvironment = readCloudflareAccountIdFromEnvironment();
  if (fromEnvironment) {
    return fromEnvironment;
  }

  const { stdout } = await runWrangler(["whoami", "--json"], {
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(stdout) as {
    accounts?: Array<{ id?: string }>;
  };
  const accountId = parsed.accounts?.[0]?.id;
  if (!accountId) {
    throw new Error(
      "Could not resolve Cloudflare account id. Set ARIA_CLOUDFLARE_ACCOUNT_ID or run `wrangler login`.",
    );
  }
  return accountId;
}
