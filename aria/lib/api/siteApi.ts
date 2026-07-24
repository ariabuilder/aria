import { z } from "zod";
import { collections } from "../../actions/cms/collections";
import { entries } from "../../actions/cms/entries";
import { revisions } from "../../actions/cms/revisions";
import {
  PublishEntryRequestSchema,
  RestoreRevisionRequestSchema,
  UnpublishEntryRequestSchema,
} from "../cms/actionSchemas";
import {
  CreateEntryRequestSchema,
  UpdateEntryRequestSchema,
} from "../cms/schemas";
import type { RequestRuntimeLocals } from "../runtime/requestLocals";
import { invokeApiAction } from "./actionBridge";
import { authenticateApiRequest, type AuthenticatedApiRequest } from "./auth";
import { createEntryCursor, parseEntryCursor } from "./cursor";
import { stableJson } from "./crypto";
import {
  apiErrorResponse,
  apiJson,
  apiRequestId,
  ApiHttpError,
  entryEtag,
  readJsonBody,
  requireEntryIfMatch,
} from "./http";
import { runIdempotentMutation } from "./idempotency";
import type { ApiScope } from "./schemas";
import {
  attachApiMutationContext,
  createApiMutationActionContext,
  type StoredApiResponse,
} from "./mutationContext";

type ApiRouteContext = {
  request: Request;
  locals: RequestRuntimeLocals;
  params: Record<string, string | undefined>;
};

function routeParam(context: ApiRouteContext, name: string): string {
  const value = context.params[name]?.trim();
  if (!value) {
    throw new ApiHttpError({
      status: 404,
      code: "not_found",
      message: "Resource not found",
    });
  }
  return value;
}

async function withApiErrors(
  request: Request,
  run: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = apiRequestId(request);
  try {
    return await run(requestId);
  } catch (error) {
    return apiErrorResponse(requestId, error);
  }
}

async function authorized(
  context: ApiRouteContext,
  requestId: string,
  scopes: readonly ApiScope[],
): Promise<AuthenticatedApiRequest> {
  return authenticateApiRequest({
    request: context.request,
    locals: context.locals,
    requestId,
    requiredScopes: scopes,
  });
}

function parseActionInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiHttpError({
      status: 422,
      code: "validation_failed",
      message: "Request validation failed",
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

function publicCollectionSummary(value: unknown) {
  const collection = value as {
    id: string;
    name: string;
    label: string;
    kind: string;
    scope: string;
    supports: string[];
    updatedAt: string;
  };
  return {
    id: collection.id,
    name: collection.name,
    label: collection.label,
    kind: collection.kind,
    scope: collection.scope,
    supports: collection.supports,
    updatedAt: collection.updatedAt,
  };
}

function successfulEntryMutationResponse(
  record: { entry: { id: string; version: string } },
  options: { status?: number; location?: string } = {},
): StoredApiResponse {
  const etag = entryEtag(record.entry.version);
  return {
    status: options.status ?? 200,
    body: { success: true, data: record },
    headers: {
      ETag: etag,
      ...(options.location ? { Location: options.location } : {}),
    },
    resourceVersion: etag,
  };
}

export function handleListCollections(
  context: ApiRouteContext,
): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["collections:read"]);
    const raw = (await invokeApiAction(
      collections.list,
      auth.actionContext,
      {},
    )) as {
      collections: unknown[];
    };
    return apiJson(requestId, {
      items: raw.collections.map(publicCollectionSummary),
      nextCursor: null,
    });
  });
}

export function handleGetCollection(
  context: ApiRouteContext,
): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["collections:read"]);
    const collection = await invokeApiAction(
      collections.get,
      auth.actionContext,
      {
        id: routeParam(context, "collectionId"),
      },
    );
    return apiJson(requestId, collection);
  });
}

const StatusQuerySchema = z.enum([
  "draft",
  "published",
  "scheduled",
  "archived",
]);

function entryListQuery(url: URL) {
  const pageSizeResult = z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .safeParse(url.searchParams.get("pageSize") ?? 50);
  const statusResult = z
    .array(StatusQuerySchema)
    .safeParse(url.searchParams.getAll("status"));
  if (!pageSizeResult.success || !statusResult.success) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "Invalid entry list query parameters",
      details: [
        ...(pageSizeResult.success ? [] : pageSizeResult.error.issues),
        ...(statusResult.success ? [] : statusResult.error.issues),
      ],
    });
  }
  const pageSize = pageSizeResult.data;
  const statuses = statusResult.data;
  return {
    pageSize,
    status:
      statuses.length === 0
        ? undefined
        : statuses.length === 1
          ? statuses[0]
          : statuses,
    query: url.searchParams.get("query")?.trim() || undefined,
    locale: url.searchParams.get("locale")?.trim() || undefined,
  };
}

export function handleListEntries(context: ApiRouteContext): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["entries:read"]);
    const collectionId = routeParam(context, "collectionId");
    const url = new URL(context.request.url);
    const query = entryListQuery(url);
    const binding = stableJson({
      status: query.status,
      query: query.query,
      locale: query.locale,
      pageSize: query.pageSize,
    });
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor
      ? await parseEntryCursor(context.locals, rawCursor, {
          site: auth.siteId,
          collectionId,
          binding,
        })
      : null;
    const input = {
      collectionId,
      pageSize: query.pageSize,
      status: query.status,
      query: query.query,
      locale: query.locale,
      cursor: cursor ? { page: cursor.page, index: cursor.index } : undefined,
    };
    const result = (await invokeApiAction(
      entries.listCursor,
      auth.actionContext,
      input,
    )) as {
      items: unknown[];
      next: { page: number; index: number } | null;
    };
    const nextCursor = result.next
      ? await createEntryCursor(context.locals, {
          site: auth.siteId,
          resource: "entries",
          collectionId,
          binding,
          page: result.next.page,
          index: result.next.index,
          pageSize: query.pageSize,
        })
      : null;
    return apiJson(requestId, { items: result.items, nextCursor });
  });
}

export function handleGetEntry(context: ApiRouteContext): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["entries:read"]);
    const entry = (await invokeApiAction(entries.get, auth.actionContext, {
      collectionId: routeParam(context, "collectionId"),
      idOrSlug: routeParam(context, "entryId"),
      locale:
        new URL(context.request.url).searchParams.get("locale") ?? undefined,
    })) as { entry: { version: string } };
    return apiJson(requestId, entry, {
      headers: { ETag: entryEtag(entry.entry.version) },
    });
  });
}

export function handleCreateEntry(context: ApiRouteContext): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["entries:write"]);
    const collectionId = routeParam(context, "collectionId");
    const body = await readJsonBody(context.request);
    const actionInput = parseActionInput(CreateEntryRequestSchema, {
      ...(body as object),
      collectionId,
    });
    if (actionInput.status && actionInput.status !== "draft") {
      throw new ApiHttpError({
        status: 422,
        code: "validation_failed",
        message: "Create entries as drafts, then use the publish endpoint",
      });
    }
    return runIdempotentMutation({
      request: context.request,
      requestId,
      repository: auth.repository,
      credentialId: auth.credential.id,
      siteId: auth.siteId,
      actorId: auth.user.id,
      routeTemplate: "/api/v1/collections/{collectionId}/entries",
      validatedBody: actionInput,
      ifMatch: null,
      run: async (execution) => {
        const location = `/api/v1/collections/${encodeURIComponent(collectionId)}/entries`;
        const mutation = createApiMutationActionContext({
          execution,
          responseFor: (record) =>
            successfulEntryMutationResponse(record, {
              status: 201,
              location: `${location}/${encodeURIComponent(record.entry.id)}`,
            }),
        });
        const entry = (await invokeApiAction(
          entries.create,
          attachApiMutationContext(auth.actionContext, mutation),
          actionInput,
        )) as { entry: { id: string; version: string } };
        const response = apiJson(requestId, entry, {
          status: 201,
          headers: {
            ETag: entryEtag(entry.entry.version),
            Location: `${location}/${encodeURIComponent(entry.entry.id)}`,
          },
        });
        return {
          response,
          atomicallyCompleted: mutation.committedResponse() !== null,
        };
      },
    });
  });
}

async function currentEntry(
  auth: AuthenticatedApiRequest,
  collectionId: string,
  entryId: string,
): Promise<{ entry: { version: string } }> {
  return (await invokeApiAction(entries.get, auth.actionContext, {
    collectionId,
    idOrSlug: entryId,
  })) as { entry: { version: string } };
}

async function assertMatchedVersion(
  expected: string,
  auth: AuthenticatedApiRequest,
  collectionId: string,
  entryId: string,
): Promise<void> {
  const current = await currentEntry(auth, collectionId, entryId);
  if (current.entry.version !== expected) {
    throw new ApiHttpError({
      status: 412,
      code: "precondition_failed",
      message: "If-Match does not match the current entry version",
      headers: { ETag: entryEtag(current.entry.version) },
    });
  }
}

async function invokeConditionalEntryMutation(input: {
  action: unknown;
  actionContext: Parameters<typeof invokeApiAction>[1];
  actionInput: unknown;
  auth: AuthenticatedApiRequest;
  collectionId: string;
  entryId: string;
}): Promise<unknown> {
  try {
    return await invokeApiAction(
      input.action,
      input.actionContext,
      input.actionInput,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLocaleLowerCase().includes("version conflict")) throw error;
    const current = await currentEntry(
      input.auth,
      input.collectionId,
      input.entryId,
    );
    throw new ApiHttpError({
      status: 412,
      code: "precondition_failed",
      message: "If-Match does not match the current entry version",
      headers: { ETag: entryEtag(current.entry.version) },
    });
  }
}

export function handleUpdateEntry(context: ApiRouteContext): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["entries:write"]);
    const collectionId = routeParam(context, "collectionId");
    const entryId = routeParam(context, "entryId");
    const version = requireEntryIfMatch(context.request);
    const body = await readJsonBody(context.request);
    const actionInput = parseActionInput(UpdateEntryRequestSchema, {
      collectionId,
      id: entryId,
      version,
      patch: body,
    });
    if (actionInput.patch.status !== undefined) {
      throw new ApiHttpError({
        status: 422,
        code: "validation_failed",
        message: "Use the publish or unpublish endpoint to change entry status",
      });
    }
    return runIdempotentMutation({
      request: context.request,
      requestId,
      repository: auth.repository,
      credentialId: auth.credential.id,
      siteId: auth.siteId,
      actorId: auth.user.id,
      routeTemplate: "/api/v1/collections/{collectionId}/entries/{entryId}",
      validatedBody: actionInput,
      ifMatch: version,
      run: async (execution) => {
        await assertMatchedVersion(version, auth, collectionId, entryId);
        const mutation = createApiMutationActionContext({
          execution,
          responseFor: (record) => successfulEntryMutationResponse(record),
        });
        const entry = (await invokeConditionalEntryMutation({
          action: entries.update,
          actionContext: attachApiMutationContext(auth.actionContext, mutation),
          actionInput,
          auth,
          collectionId,
          entryId,
        })) as { entry: { version: string } };
        const response = apiJson(requestId, entry, {
          headers: { ETag: entryEtag(entry.entry.version) },
        });
        return {
          response,
          atomicallyCompleted: mutation.committedResponse() !== null,
        };
      },
    });
  });
}

async function handlePublishMutation(
  context: ApiRouteContext,
  mode: "publish" | "unpublish",
): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, ["entries:publish"]);
    const collectionId = routeParam(context, "collectionId");
    const entryId = routeParam(context, "entryId");
    const version = requireEntryIfMatch(context.request);
    const body = await readJsonBody(context.request);
    const schema =
      mode === "publish"
        ? PublishEntryRequestSchema
        : UnpublishEntryRequestSchema;
    const actionInput = parseActionInput(schema, {
      ...(body as object),
      collectionId,
      id: entryId,
      version,
    });
    return runIdempotentMutation({
      request: context.request,
      requestId,
      repository: auth.repository,
      credentialId: auth.credential.id,
      siteId: auth.siteId,
      actorId: auth.user.id,
      routeTemplate: `/api/v1/collections/{collectionId}/entries/{entryId}/${mode}`,
      validatedBody: actionInput,
      ifMatch: version,
      run: async (execution) => {
        await assertMatchedVersion(version, auth, collectionId, entryId);
        const mutation = createApiMutationActionContext({
          execution,
          responseFor: (record) => successfulEntryMutationResponse(record),
        });
        const entry = (await invokeConditionalEntryMutation({
          action: mode === "publish" ? entries.publish : entries.unpublish,
          actionContext: attachApiMutationContext(auth.actionContext, mutation),
          actionInput,
          auth,
          collectionId,
          entryId,
        })) as { entry: { version: string } };
        const response = apiJson(requestId, entry, {
          headers: { ETag: entryEtag(entry.entry.version) },
        });
        return {
          response,
          atomicallyCompleted: mutation.committedResponse() !== null,
        };
      },
    });
  });
}

export const handlePublishEntry = (context: ApiRouteContext) =>
  handlePublishMutation(context, "publish");
export const handleUnpublishEntry = (context: ApiRouteContext) =>
  handlePublishMutation(context, "unpublish");

export function handleRestoreRevision(
  context: ApiRouteContext,
): Promise<Response> {
  return withApiErrors(context.request, async (requestId) => {
    const auth = await authorized(context, requestId, [
      "entries:write",
      "entries:publish",
    ]);
    const collectionId = routeParam(context, "collectionId");
    const entryId = routeParam(context, "entryId");
    const revisionId = routeParam(context, "revisionId");
    const version = requireEntryIfMatch(context.request);
    const body = await readJsonBody(context.request);
    const empty = z.object({}).strict().safeParse(body);
    if (!empty.success) {
      throw new ApiHttpError({
        status: 422,
        code: "validation_failed",
        message: "Revision restore does not accept body fields",
        details: empty.error.issues,
      });
    }
    const actionInput = parseActionInput(RestoreRevisionRequestSchema, {
      collectionId,
      entryId,
      revisionId,
      expectedVersion: version,
    });
    return runIdempotentMutation({
      request: context.request,
      requestId,
      repository: auth.repository,
      credentialId: auth.credential.id,
      siteId: auth.siteId,
      actorId: auth.user.id,
      routeTemplate:
        "/api/v1/collections/{collectionId}/entries/{entryId}/revisions/{revisionId}/restore",
      validatedBody: actionInput,
      ifMatch: version,
      run: async (execution) => {
        await assertMatchedVersion(version, auth, collectionId, entryId);
        const mutation = createApiMutationActionContext({
          execution,
          responseFor: (record) => successfulEntryMutationResponse(record),
        });
        const entry = (await invokeConditionalEntryMutation({
          action: revisions.restore,
          actionContext: attachApiMutationContext(auth.actionContext, mutation),
          actionInput,
          auth,
          collectionId,
          entryId,
        })) as { entry: { version: string } };
        const response = apiJson(requestId, entry, {
          headers: { ETag: entryEtag(entry.entry.version) },
        });
        return {
          response,
          atomicallyCompleted: mutation.committedResponse() !== null,
        };
      },
    });
  });
}
