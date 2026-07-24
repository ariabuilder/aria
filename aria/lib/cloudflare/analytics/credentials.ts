/**
 * Resolve Cloudflare zone analytics API credentials from Worker runtime or Node.
 */

import {
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../../cloudflare/env";

const TOKEN_KEYS = [
  // Keep the least-privileged analytics credential ahead of broader platform
  // tokens so an unrelated token cannot shadow it at runtime.
  "ARIA_CLOUDFLARE_ANALYTICS_TOKEN",
  "ARIA_CLOUDFLARE_API_TOKEN",
  "ARIA_CF_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
] as const;

const ZONE_KEYS = [
  "ARIA_CLOUDFLARE_ZONE_ID",
  "ARIA_CF_ZONE_ID",
  "CLOUDFLARE_ZONE_ID",
  "CF_ZONE_ID",
] as const;

function readFirstSetting(
  keys: readonly string[],
  locals?: RuntimeLocals,
): string | undefined {
  for (const key of keys) {
    const value = getStringRuntimeSetting(key, locals)?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveCloudflareAnalyticsCredentials(locals?: RuntimeLocals): {
  apiToken: string | undefined;
  zoneId: string | undefined;
} {
  return {
    apiToken: readFirstSetting(TOKEN_KEYS, locals),
    zoneId: readFirstSetting(ZONE_KEYS, locals),
  };
}

export function areCloudflareAnalyticsCredentialsReady(
  locals?: RuntimeLocals,
): boolean {
  const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(locals);
  return Boolean(apiToken && zoneId);
}
