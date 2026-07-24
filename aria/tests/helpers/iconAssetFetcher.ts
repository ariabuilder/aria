import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IconAssetFetcher } from "../../lib/icons/staticIconProvider";

const publicRoot = path.resolve(process.cwd(), "public");

export function createIconAssetFetcher(): IconAssetFetcher {
  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const filePath = path.resolve(
        publicRoot,
        decodeURIComponent(url.pathname).replace(/^\/+/, ""),
      );
      if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
        return new Response("Not found", { status: 404 });
      }
      try {
        return new Response(await readFile(filePath), {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}
