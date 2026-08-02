import type { APIRoute } from "astro";
import { z } from "zod";

import { compileUnoCSS } from "../lib/styles/compileUnoCSS";
import { isRenderingParityLoopbackHostname } from "./renderingParityRoute";

export const prerender = false;

const QuerySchema = z
  .object({
    runtime: z.enum(["node", "workerd"]),
  })
  .strict();

export const GET: APIRoute = async ({ url }) => {
  if (!isRenderingParityLoopbackHostname(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const query = QuerySchema.safeParse({
    runtime: url.searchParams.get("runtime"),
  });
  if (!query.success) {
    return new Response("Invalid parity request", { status: 400 });
  }

  const css = await compileUnoCSS(
    '<div class="grid gap-4 text-red-500 h-8"></div>',
    "",
    "",
    "class",
  );
  if (!css.includes("display:grid")) {
    return new Response("Compiler probe did not produce grid utility CSS", {
      status: 500,
    });
  }
  if (!css.includes("height:2rem")) {
    return new Response("Compiler probe did not produce h-8 utility CSS", {
      status: 500,
    });
  }

  return Response.json(
    {
      runtime: query.data.runtime,
      css,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
};
