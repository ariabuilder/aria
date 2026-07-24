import type { AuthAdapter } from "../adapter";
import {
  AuthMethodsConfigSchema,
  CloudflareAccessAuthMethodConfigSchema,
  CONFIG_KEYS,
  MagicLinkAuthMethodConfigSchema,
  OAuthAuthMethodConfigSchema,
  PasskeyAuthMethodConfigSchema,
  PasswordAuthMethodConfigSchema,
  type AuthMethod,
  type AuthMethodsConfig,
} from "../types";

type AuthConfigAdapter = Pick<AuthAdapter, "getConfig" | "setConfig">;

export interface AuthMethodsConfigOptions {
  requestUrl?: string;
  persistDefaultOrigins?: boolean;
  isDev?: boolean;
}

const DEV_ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
] as const;

const DEFAULT_AUTH_METHODS_CONFIG = AuthMethodsConfigSchema.parse({});

function resolveUrl(requestUrl: string): URL {
  return new URL(requestUrl);
}

function uniqueOrigins(origins: readonly string[]): string[] {
  return [...new Set(origins)];
}

function resolveSeedOrigins(
  requestUrl: string | undefined,
  isDev: boolean,
): string[] {
  const origins: string[] = [];
  if (requestUrl) origins.push(resolveUrl(requestUrl).origin);
  if (isDev) origins.push(...DEV_ALLOWED_ORIGINS);
  return uniqueOrigins(origins);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuthMethodsConfig(raw: unknown): {
  config: AuthMethodsConfig;
  canPersistSeededConfig: boolean;
} {
  if (raw === null || raw === undefined) {
    return {
      config: DEFAULT_AUTH_METHODS_CONFIG,
      canPersistSeededConfig: true,
    };
  }

  const fullParsed = AuthMethodsConfigSchema.safeParse(raw);
  if (fullParsed.success) {
    return {
      config: fullParsed.data,
      canPersistSeededConfig: true,
    };
  }

  if (!isRecord(raw)) {
    return {
      config: DEFAULT_AUTH_METHODS_CONFIG,
      canPersistSeededConfig: false,
    };
  }

  const passkey = PasskeyAuthMethodConfigSchema.safeParse(raw.passkey);
  const magicLink = MagicLinkAuthMethodConfigSchema.safeParse(raw.magicLink);
  const password = PasswordAuthMethodConfigSchema.safeParse(raw.password);
  const oauth = OAuthAuthMethodConfigSchema.safeParse(raw.oauth);
  const cloudflareAccess = CloudflareAccessAuthMethodConfigSchema.safeParse(
    raw.cloudflareAccess,
  );

  return {
    config: AuthMethodsConfigSchema.parse({
      passkey: passkey.success ? passkey.data : undefined,
      magicLink: magicLink.success ? magicLink.data : undefined,
      password: password.success ? password.data : undefined,
      oauth: oauth.success ? oauth.data : undefined,
      cloudflareAccess: cloudflareAccess.success
        ? cloudflareAccess.data
        : undefined,
    }),
    canPersistSeededConfig: false,
  };
}

export function resolveRpId(requestUrl: string): string {
  return resolveUrl(requestUrl).hostname;
}

function isLocalDevHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function localDevOrigins(requestUrl: string): string[] {
  const url = resolveUrl(requestUrl);
  const port = url.port ? `:${url.port}` : "";
  return [`http://localhost${port}`, `http://127.0.0.1${port}`];
}

/**
 * WebAuthn ceremonies bind credentials to a single rpId hostname. In local
 * development, treat localhost and 127.0.0.1 as equivalent for verification.
 */
export function resolveExpectedRpIds(requestUrl: string): string | string[] {
  const hostname = resolveRpId(requestUrl);
  if (isLocalDevHostname(hostname)) {
    return ["localhost", "127.0.0.1"];
  }
  return hostname;
}

export function resolveAllowedOrigins(
  config: AuthMethodsConfig,
  requestUrl?: string,
): string[] {
  const currentOrigin = requestUrl ? [resolveUrl(requestUrl).origin] : [];
  const origins = uniqueOrigins([
    ...config.passkey.allowedOrigins,
    ...currentOrigin,
  ]);
  if (requestUrl && isLocalDevHostname(resolveRpId(requestUrl))) {
    return uniqueOrigins([...origins, ...localDevOrigins(requestUrl)]);
  }
  return origins;
}

export function isAuthMethodEnabled(
  config: AuthMethodsConfig,
  method: AuthMethod,
): boolean {
  switch (method) {
    case "passkey":
      return config.passkey.enabled;
    case "password":
      return config.password.enabled;
    case "magic_link":
      return config.magicLink.enabled;
    case "oauth":
      return Boolean(config.oauth.github?.enabled || config.oauth.google?.enabled);
    case "cloudflare_access":
      return config.cloudflareAccess.enabled;
    case "session":
      return true;
  }
}

export async function getAuthMethodsConfig(
  adapter: AuthConfigAdapter,
  options: AuthMethodsConfigOptions = {},
): Promise<AuthMethodsConfig> {
  const { config, canPersistSeededConfig } = parseAuthMethodsConfig(
    await adapter.getConfig<unknown>(CONFIG_KEYS.AUTH_METHODS),
  );

  const shouldSeedOrigins =
    config.passkey.allowedOrigins.length === 0 &&
    (options.requestUrl || options.isDev === true);

  if (!shouldSeedOrigins) return config;

  const seededConfig = AuthMethodsConfigSchema.parse({
    ...config,
    passkey: {
      ...config.passkey,
      allowedOrigins: resolveSeedOrigins(
        options.requestUrl,
        options.isDev === true,
      ),
    },
  });

  if (options.persistDefaultOrigins !== false && canPersistSeededConfig) {
    await adapter.setConfig(CONFIG_KEYS.AUTH_METHODS, seededConfig);
  }

  return seededConfig;
}
