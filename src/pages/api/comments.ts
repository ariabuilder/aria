import type { APIRoute } from "astro";
import { z } from "zod";
import { getAuthAdapterAsync, getSessionIdFromCookies } from "../../../aria/lib/auth";
import { CmsServiceError } from "../../../aria/lib/cms/errors";
import {
  listApprovedPublicComments,
  submitPublicComment,
} from "../../../aria/lib/cms/services/publicComments";
import { getStorageAdapterAsync } from "../../../aria/lib/storage/getStorageAdapter";
import { readSessionUserFromLocals } from "../../../aria/lib/runtime/requestLocals";

const PublicCommentTargetSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
  })
  .strict();

const PublicCommentSubmissionSchema = PublicCommentTargetSchema.extend({
  body: z.string().max(4_000),
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict();

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function errorResponse(error: unknown): Response {
  if (error instanceof CmsServiceError) {
    if (error.code === "NOT_FOUND") {
      return noStore(Response.json({ error: "Not found" }, { status: 404 }));
    }
    if (error.code === "RATE_LIMITED") {
      return noStore(Response.json({ error: "Try again later" }, { status: 429 }));
    }
    if (error.code === "VALIDATION_ERROR") {
      return noStore(Response.json({ error: error.message }, { status: 400 }));
    }
  }
  return noStore(Response.json({ error: "Unable to process comments" }, { status: 500 }));
}

function hasSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ url, locals }) => {
  const parsed = PublicCommentTargetSchema.safeParse({
    collectionId: url.searchParams.get("collectionId"),
    entryId: url.searchParams.get("entryId"),
    locale: url.searchParams.get("locale"),
  });
  const limit = z.coerce.number().int().min(1).max(100).safeParse(
    url.searchParams.get("limit") ?? 25,
  );
  const offset = z.coerce.number().int().min(0).safeParse(
    url.searchParams.get("offset") ?? 0,
  );
  if (!parsed.success || !limit.success || !offset.success) {
    return noStore(Response.json({ error: "Invalid comment request" }, { status: 400 }));
  }
  try {
    const comments = await listApprovedPublicComments(
      await getStorageAdapterAsync(locals),
      { ...parsed.data, limit: limit.data, offset: offset.data },
    );
    return Response.json({ comments }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request, url, locals, cookies }) => {
  if (!hasSameOrigin(request, url)) {
    return noStore(Response.json({ error: "Forbidden" }, { status: 403 }));
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore(Response.json({ error: "Invalid JSON" }, { status: 400 }));
  }
  const parsed = PublicCommentSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    return noStore(Response.json({ error: "Invalid comment request" }, { status: 400 }));
  }
  let user = readSessionUserFromLocals(locals);
  if (!user) {
    const sessionId = getSessionIdFromCookies(cookies);
    if (sessionId) {
      user = await (await getAuthAdapterAsync(locals)).getSessionUser(sessionId);
    }
  }
  if (!user) {
    return noStore(Response.json({ error: "Sign in to comment" }, { status: 401 }));
  }
  try {
    const comment = await submitPublicComment(
      await getStorageAdapterAsync(locals),
      parsed.data,
      user,
    );
    return noStore(Response.json({ comment, status: "pending" }, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
};
