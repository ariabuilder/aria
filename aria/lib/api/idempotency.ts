import { sha256Base64Url, stableJson } from "./crypto";
import { apiErrorResponse, ApiHttpError } from "./http";
import type { ApiRepository } from "./repository";
import { IdempotencyKeySchema } from "./schemas";
import type { ApiIdempotencyExecution } from "./mutationContext";

export type IdempotentMutationRunResult =
  | Response
  | { response: Response; atomicallyCompleted: boolean };

export async function runIdempotentMutation(input: {
  request: Request;
  requestId: string;
  repository: ApiRepository;
  credentialId: string;
  siteId: string;
  actorId: string;
  routeTemplate: string;
  validatedBody: unknown;
  ifMatch: string | null;
  run(execution: ApiIdempotencyExecution): Promise<IdempotentMutationRunResult>;
}): Promise<Response> {
  const parsedKey = IdempotencyKeySchema.safeParse(
    input.request.headers.get("Idempotency-Key"),
  );
  if (!parsedKey.success) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "A 16-200 character printable ASCII Idempotency-Key is required",
    });
  }
  const url = new URL(input.request.url);
  const query = [...url.searchParams.entries()].sort(
    ([aKey, aValue], [bKey, bValue]) =>
      aKey.localeCompare(bKey) || aValue.localeCompare(bValue),
  );
  const fingerprint = await sha256Base64Url(
    stableJson({
      method: input.request.method,
      routeTemplate: input.routeTemplate,
      path: url.pathname,
      query,
      body: input.validatedBody,
      ifMatch: input.ifMatch,
    }),
  );
  const claim = await input.repository.claimIdempotency({
    credentialId: input.credentialId,
    key: parsedKey.data,
    method: input.request.method,
    routeTemplate: input.routeTemplate,
    fingerprint,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
  });
  if (claim.kind === "conflict") {
    throw new ApiHttpError({
      status: 409,
      code: "conflict",
      message: "Idempotency-Key was already used for a different request",
    });
  }
  if (claim.kind === "processing") {
    throw new ApiHttpError({
      status: 409,
      code: "conflict",
      message: "A request with this Idempotency-Key is still processing",
      headers: { "Retry-After": "2" },
    });
  }
  if (claim.kind === "replay") {
    const headers = new Headers(claim.response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("X-Aria-Request-Id", input.requestId);
    headers.set("Idempotency-Replayed", "true");
    return Response.json(claim.response.body, {
      status: claim.response.status,
      headers,
    });
  }

  let response: Response;
  let atomicallyCompleted = false;
  try {
    const result = await input.run({
      credentialId: input.credentialId,
      key: parsedKey.data,
      fingerprint,
      leaseToken: claim.leaseToken,
      requestId: input.requestId,
      siteId: input.siteId,
      actorId: input.actorId,
      method: input.request.method,
      routeTemplate: input.routeTemplate,
    });
    if (result instanceof Response) {
      response = result;
    } else {
      response = result.response;
      atomicallyCompleted = result.atomicallyCompleted;
    }
  } catch (error) {
    response = apiErrorResponse(input.requestId, error);
  }
  if (response.status >= 500) {
    await input.repository.abandonIdempotency({
      credentialId: input.credentialId,
      key: parsedKey.data,
      fingerprint,
      leaseToken: claim.leaseToken,
    });
    return response;
  }
  const body = await response.clone().json();
  const persistedHeaders = Object.fromEntries(
    ["ETag", "Location"]
      .map((name) => [name, response.headers.get(name)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );
  await input.repository.completeIdempotency({
    credentialId: input.credentialId,
    key: parsedKey.data,
    fingerprint,
    leaseToken: claim.leaseToken,
    response: {
      status: response.status,
      body,
      headers: persistedHeaders,
      resourceVersion: response.headers.get("ETag"),
    },
  });
  if (!atomicallyCompleted) {
    await input.repository.appendSecurityAudit({
      requestId: input.requestId,
      siteId: input.siteId,
      actorId: input.actorId,
      credentialId: input.credentialId,
      eventType: "mutation",
      method: input.request.method,
      routeTemplate: input.routeTemplate,
      outcome: response.status < 400 ? "success" : "client_error",
      metadata: { status: response.status },
    });
  }
  return response;
}
