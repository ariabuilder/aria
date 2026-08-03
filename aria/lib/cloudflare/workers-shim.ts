/**
 * Node-only substitute for `cloudflare:workers` used by `ARIA_RUNTIME=node`. Astro serves public files itself,
 * but server-side icon resolution also needs to read the same immutable.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface DurableObjectWebSocket extends WebSocket {
  serializeAttachment(attachment: unknown): void;
  deserializeAttachment(): unknown;
}

export interface WebSocketRequestResponsePair {
  readonly request: string;
  readonly response: string;
}

export interface DurableObjectState {
  acceptWebSocket(socket: DurableObjectWebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): DurableObjectWebSocket[];
  setWebSocketAutoResponse(
    pair: WebSocketRequestResponsePair | undefined,
  ): void;
}

export abstract class DurableObject<Env = Record<string, unknown>> {
  protected readonly ctx: DurableObjectState;
  protected readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export interface CachePurgeResult {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

/** Node has no Workers edge cache; a purge is therefore already satisfied. */
export const cache = {
  async purge(): Promise<CachePurgeResult> {
    return { success: true, errors: [] };
  },
};

const publicRoot = path.resolve(process.cwd(), "public");

function contentType(pathname: string): string {
  return pathname.endsWith(".json")
    ? "application/json; charset=utf-8"
    : "application/octet-stream";
}

const ariaAssets = {
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(publicRoot, relativePath);
    if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const body = await readFile(filePath);
      return new Response(body, {
        headers: { "Content-Type": contentType(filePath) },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

export const env = { aria_assets: ariaAssets } as Record<string, unknown>;
