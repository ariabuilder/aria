import { getStringRuntimeSetting, type RuntimeLocals } from "../cloudflare/env";

export const FIGMA_OAUTH_CLIENT_ID = "aria-figma-plugin" as const;
export const OAUTH_DEVICE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code" as const;
export const OAUTH_REFRESH_GRANT_TYPE = "refresh_token" as const;
export const OAUTH_ACCESS_AUDIENCE = "aria-figma-api" as const;

export type OAuthConfiguration = Readonly<{
  canonicalOrigin: string;
}>;

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

export function readOAuthConfiguration(
  locals?: RuntimeLocals,
): OAuthConfiguration {
  if (getStringRuntimeSetting("ARIA_OAUTH_ENABLED", locals) !== "true") {
    throw new Error("OAUTH_DISABLED");
  }
  const raw = getStringRuntimeSetting("ARIA_CANONICAL_ORIGIN", locals)?.trim();
  if (!raw) throw new Error("OAUTH_CANONICAL_ORIGIN_UNAVAILABLE");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("OAUTH_CANONICAL_ORIGIN_INVALID");
  }
  const development =
    getStringRuntimeSetting("NODE_ENV", locals) === "development";
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(development && url.protocol === "http:" && isLoopback(url.hostname)))
  ) {
    throw new Error("OAUTH_CANONICAL_ORIGIN_INVALID");
  }
  return { canonicalOrigin: url.origin };
}

export function assertCanonicalOAuthRequest(
  request: Request,
  configuration: OAuthConfiguration,
): void {
  if (new URL(request.url).origin !== configuration.canonicalOrigin) {
    throw new Error("OAUTH_ISSUER_MISMATCH");
  }
}
