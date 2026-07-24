/**
 * Ambient typings: Vue SFCs (`.vue`) and loose Cloudflare KV/R2/D1 bindings.
 */

/* Vue SFC module typing */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}

/* Common asset modules (optional) */
declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.woff2" {
  const url: string;
  export default url;
}

/* Cloudflare runtime types — globally available without explicit imports */
declare global {
  interface KVNamespacePutOptions {
    expiration?: number;
    expirationTtl?: number;
    metadata?: Record<string, unknown>;
  }

  interface R2ObjectBody {
    body: ReadableStream;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
  }

  interface R2Object {
    key: string;
    size?: number;
    uploaded?: Date;
    httpMetadata?: { contentType?: string };
  }

  /* Cloudflare KV (loose) */
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    get<T = string | null>(
      key: string,
      type: "text" | "json" | "arrayBuffer" | "stream",
    ): Promise<T | null>;
    put(
      key: string,
      value: string | ArrayBuffer | ReadableStream,
      options?: KVNamespacePutOptions,
    ): Promise<void>;
    delete(key: string): Promise<void>;
    list?(opts?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    }>;
  }

  /* Cloudflare R2 (loose) */
  interface R2Bucket {
    head?(key: string): Promise<{
      key: string;
      size?: number;
      etag?: string;
      httpMetadata?: { contentType?: string };
    } | null>;
    put(
      key: string,
      value: BodyInit | ArrayBuffer | ReadableStream,
      options?: {
        httpMetadata?: { contentType?: string };
        customMetadata?: Record<string, string>;
      },
    ): Promise<{ key: string; etag?: string }>;
    get(key: string): Promise<null | {
      body: ReadableStream;
      arrayBuffer(): Promise<ArrayBuffer>;
      text(): Promise<string>;
      json<T = unknown>(): Promise<T>;
    }>;
    delete(key: string): Promise<void>;
    list?(opts?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      objects: R2Object[];
      truncated: boolean;
      cursor?: string;
    }>;
  }

  /* Cloudflare D1 (very small, pragmatic surface) */
  interface D1Prepare {
    bind(...args: unknown[]): D1Prepare;
    first<T = unknown>(): Promise<T>;
    all<T = unknown>(): Promise<{ results: T[] }>;
    run<T = unknown>(): Promise<T>;
  }
  interface D1Database {
    prepare(sql: string): D1Prepare;
    exec?<T = unknown>(sql: string): Promise<T>;
  }

  /* Cloudflare AI binding (loose) */
  interface Ai {
    run(
      model: string,
      input: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  }

  /* Cloudflare Durable Object namespace (loose) */
  interface DurableObjectNamespace {
    idFromName(name: string): unknown;
    get(id: unknown): unknown;
  }

  /* PageVersion-ish interface used by storage code (loose) */
  interface PageVersion {
    id: string;
    timestamp: number;
    message: string;
    snapshot?: string;
  }

  /* Allow a loose Env type for worker bindings if used */
  type AriaEnv = {
    KV?: KVNamespace;
    R2?: R2Bucket;
    DB?: D1Database;
    aria_cache?: KVNamespace;
    aria_r2?: R2Bucket;
    EMAIL?: {
      send: (msg: {
        to: string;
        from: string;
        subject: string;
        html?: string;
        text?: string;
      }) => Promise<void>;
    };
    [key: string]: unknown;
  };

  // These globals may be referenced in runtime code; keep them optional.
  var __ARIA_ENV__: AriaEnv | undefined;

  /**
   * /** SSR-hydrated site name injected by admin. astro for LCP optimization.
   */
  var __ARIA_SSR_SITE_NAME: string | undefined;
}

/* Ensure the file is treated as a module to avoid global scope merging issues */
export {};
