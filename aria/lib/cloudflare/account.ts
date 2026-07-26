/** Reads the Cloudflare account ID from the supported environment variables. */
export function readCloudflareAccountIdFromEnvironment(): string | undefined {
  return (
    process.env.ARIA_CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    undefined
  );
}
