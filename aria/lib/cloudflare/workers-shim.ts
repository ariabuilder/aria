/**
 * Node-only substitute for `cloudflare:workers` used by `ARIA_RUNTIME=node`. Astro serves public files itself,
 * but server-side icon resolution also needs to read the same immutable.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const publicRoot = path.resolve(process.cwd(), "public");

function contentType(pathname: string): string {
  return pathname.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream";
}

const ariaAssets = {
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
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
