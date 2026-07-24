/// <reference types="astro/client" />

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

declare module "cloudflare:sockets" {
  export interface CloudflareSocket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    startTls(): CloudflareSocket;
    close(): Promise<void>;
  }
  export function connect(
    address: { hostname: string; port: number },
    options: {
      secureTransport: "off" | "on" | "starttls";
      allowHalfOpen?: boolean;
    },
  ): CloudflareSocket;
}

interface ImportMetaEnv {
  readonly PUBLIC_ARIA_FF_STUDIO_LAYOUTS?: string;
  readonly PUBLIC_ARIA_FF_STUDIO_AGENT?: string;
  readonly PUBLIC_APP_VERSION?: string;
  readonly PUBLIC_ARIA_RUNTIME?: "node" | "cloudflare";
  readonly PUBLIC_ASTRO_VERSION?: string;
  readonly PUBLIC_ASTRO_MAJOR?: string;
  readonly PUBLIC_ASTRO_CLOUDFLARE_VERSION?: string;
  readonly PUBLIC_ASTRO_VUE_VERSION?: string;
  readonly PUBLIC_UNOCSS_ASTRO_VERSION?: string;
  readonly PUBLIC_VUE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type KVNamespace = unknown;
type R2Bucket = unknown;
interface D1PreparedStatement {
  bind(...values: readonly unknown[]): D1PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  all(): Promise<{ results: unknown[] }>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface Queue<Body> {
  send(body: Body, options?: { delaySeconds?: number }): Promise<void>;
}
type ExecutionContext = unknown;

/**
 * Astro environment types
 * Iterface with Aria-specific properties
 */

declare namespace App {
  interface Locals
    extends import("../aria/lib/runtime/requestLocals").RequestRuntimeLocals {
    /**
     * Authenticated user (if logged in)
     * Populated by middleware from session cookie
     */
    user?: import("../aria/lib/auth").SessionUser;

    /**
     * Composer context - available in all Astro pages via Astro.locals.composerContext
     * Populated by middleware to detect if the request is for Composer or Stage
     */
    composerContext?: {
      /** True if in Composer (main editor) - ?aria=edit without &preview=true */
      isComposer: boolean;
      /** True if in Stage (preview iframe) - ?aria=edit&preview=true */
      isStage: boolean;
    };

    /**
     * Cloudflare execution context (when deployed to Cloudflare Workers)
     */
    cfContext?: ExecutionContext;
  }
}
