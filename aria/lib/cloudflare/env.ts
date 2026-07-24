/**
 * Cloudflare Worker bindings env. Bindings are injected per request via middleware (`locals.
 */

export type RuntimeKVNamespace = {
  get(key: string): Promise<string | null>;
  get<T = string | null>(
    key: string,
    type: "text" | "json" | "arrayBuffer" | "stream",
  ): Promise<T | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      cacheControl?: string;
      expiration?: number;
      expirationTtl?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

export type RuntimeAssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type RuntimeImagesBinding =
  import("../media/transforms/render").RuntimeImagesBinding;

export type AriaCloudflareEnv = {
  aria_assets?: RuntimeAssetFetcher;
  ARIA_ASSETS?: RuntimeAssetFetcher;
  aria_cache?: RuntimeKVNamespace;
  ARIA_CACHE?: RuntimeKVNamespace;
  aria_db?: D1Database;
  ARIA_DB?: D1Database;
  aria_r2?: R2Bucket;
  ARIA_R2?: R2Bucket;
  aria_images?: RuntimeImagesBinding;
  ARIA_IMAGES?: RuntimeImagesBinding;
  session?: RuntimeKVNamespace;
  SESSION?: RuntimeKVNamespace;
  ARIA_ICONS_KV?: unknown;
  ICONS_KV?: unknown;
  EMAIL?: unknown;
  aria_email_queue?: Queue<import("../email/types").EmailQueueMessage>;
  ARIA_EMAIL_QUEUE?: Queue<import("../email/types").EmailQueueMessage>;
  aria_thumbnail_queue?: Queue<
    import("../rendering/pageThumbnailServer").PageThumbnailJobMessage
  >;
  ARIA_THUMBNAIL_QUEUE?: Queue<
    import("../rendering/pageThumbnailServer").PageThumbnailJobMessage
  >;
  aria_integration_queue?: Queue<
    import("../../worker/integration-delivery").IntegrationWakeup
  >;
  ARIA_INTEGRATION_QUEUE?: Queue<
    import("../../worker/integration-delivery").IntegrationWakeup
  >;
  BROWSER?: unknown;
  ARIA_EMAIL_SECRET_KEY_ID?: string;
  ARIA_EMAIL_SECRET_KEY_V1?: string;
  /** Active API credential/cursor HMAC root key id. */
  ARIA_API_KEYRING_KEY_ID?: string;
  /** 32-byte base64 API root key. Add numbered keys during rotation. */
  ARIA_API_KEYRING_KEY_V1?: string;
  ARIA_WEBHOOK_EGRESS_MODE?: string;
  ARIA_WEBHOOK_EGRESS_ALLOWLIST?: string;
  ARIA_WEBHOOK_EGRESS_PROXY_URL?: string;
  /** Explicitly enables the site-local OAuth server. */
  ARIA_OAUTH_ENABLED?: string;
  /** Immutable HTTPS issuer origin used for OAuth discovery and endpoints. */
  ARIA_CANONICAL_ORIGIN?: string;
  /** Private Turnstile validation key. Must be a Worker secret, never site config. */
  TURNSTILE_SECRET_KEY?: string;
  ARIA_TURNSTILE_ENCRYPTION_KEY_ID?: string;
  ARIA_TURNSTILE_ENCRYPTION_KEY_V1?: string;
  R2_PUBLIC_URL?: string;
  ARIA_STORAGE_BACKEND?: string;
  ARIA_STORAGE?: string;
  ARIA_FORCE_CLOUDFLARE?: string;
  ARIA_AUTH_BACKEND?: string;
  ARIA_CLOUDFLARE_API_TOKEN?: string;
  ARIA_CLOUDFLARE_ACCOUNT_ID?: string;
  ARIA_CLOUDFLARE_ZONE_ID?: string;
  ARIA_CLOUDFLARE_ANALYTICS_TOKEN?: string;
  ARIA_CF_API_TOKEN?: string;
  ARIA_CF_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
  ai?: Ai;
  AI?: Ai;
  aria_studio_agent?: DurableObjectNamespace;
  ARIA_STUDIO_AGENT?: DurableObjectNamespace;
  aria_studio_live?: DurableObjectNamespace;
  ARIA_STUDIO_LIVE?: DurableObjectNamespace;
  [key: string]: unknown;
};

export type RuntimeLocals = {
  cfContext?: unknown;
  /** Explicit bindings override (tests, Durable Object handlers). */
  cfBindings?: AriaCloudflareEnv;
  /** Request origin used by the static-assets binding for internal reads. */
  assetOrigin?: string;
  /** Canonical locale context resolved by public-request middleware. */
  publicLocale?: string;
  publicLocalePathname?: string;
};

export function getCloudflareEnv(locals?: RuntimeLocals): AriaCloudflareEnv {
  const env = locals?.cfBindings ?? {};
  return {
    ...env,
    aria_assets: env.aria_assets ?? env.ARIA_ASSETS,
    aria_cache: env.aria_cache ?? env.ARIA_CACHE,
    aria_db: env.aria_db ?? env.ARIA_DB,
    aria_r2: env.aria_r2 ?? env.ARIA_R2,
    aria_images: env.aria_images ?? env.ARIA_IMAGES,
    session: env.session ?? env.SESSION,
    aria_email_queue: env.aria_email_queue ?? env.ARIA_EMAIL_QUEUE,
    aria_thumbnail_queue: env.aria_thumbnail_queue ?? env.ARIA_THUMBNAIL_QUEUE,
    aria_integration_queue:
      env.aria_integration_queue ?? env.ARIA_INTEGRATION_QUEUE,
    ai: env.ai ?? env.AI,
    aria_studio_agent: env.aria_studio_agent ?? env.ARIA_STUDIO_AGENT,
    aria_studio_live: env.aria_studio_live ?? env.ARIA_STUDIO_LIVE,
  };
}

function isKVNamespace(value: unknown): value is RuntimeKVNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { get?: unknown }).get === "function" &&
    typeof (value as { put?: unknown }).put === "function" &&
    typeof (value as { delete?: unknown }).delete === "function"
  );
}

export function getRuntimeKVNamespace(
  locals: RuntimeLocals | undefined,
  name: "aria_cache" | "session",
): RuntimeKVNamespace | undefined {
  const binding = getCloudflareEnv(locals)[name];
  return isKVNamespace(binding) ? binding : undefined;
}

export function getStringRuntimeSetting(
  name: string,
  locals?: RuntimeLocals,
): string | undefined {
  const runtimeValue = getCloudflareEnv(locals)[name];
  if (typeof runtimeValue === "string") {
    return runtimeValue;
  }

  if (typeof process !== "undefined") {
    return (process.env as Record<string, string | undefined>)[name];
  }

  return undefined;
}
