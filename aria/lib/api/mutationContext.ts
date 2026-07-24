import type { ActionAPIContext } from "astro:actions";
import type { AriaEntryRecord } from "../cms/schemas";

const API_MUTATION_CONTEXT_SYMBOL = Symbol.for("aria.apiMutationContext");

export type StoredApiResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  resourceVersion: string | null;
};

export type ApiIdempotencyExecution = {
  credentialId: string;
  key: string;
  fingerprint: string;
  leaseToken: string;
  requestId: string;
  siteId: string;
  actorId: string;
  method: string;
  routeTemplate: string;
};

export type ApiEntryMutationCommit = {
  credentialId: string;
  key: string;
  fingerprint: string;
  leaseToken: string;
  committedAt: string;
  response: StoredApiResponse;
  securityAudit: {
    id: string;
    requestId: string;
    siteId: string;
    actorId: string;
    credentialId: string;
    eventType: "mutation";
    method: string;
    routeTemplate: string;
    outcome: "success";
    metadataJson: string;
    createdAt: string;
    expiresAt: string;
  };
};

export type ApiMutationActionContext = {
  prepare(record: AriaEntryRecord): ApiEntryMutationCommit;
  markCommitted(response: StoredApiResponse): void;
  committedResponse(): StoredApiResponse | null;
};

export function createApiMutationActionContext(input: {
  execution: ApiIdempotencyExecution;
  responseFor(record: AriaEntryRecord): StoredApiResponse;
}): ApiMutationActionContext {
  let committed: StoredApiResponse | null = null;
  return {
    prepare(record) {
      const committedAt = new Date().toISOString();
      const response = input.responseFor(record);
      return {
        credentialId: input.execution.credentialId,
        key: input.execution.key,
        fingerprint: input.execution.fingerprint,
        leaseToken: input.execution.leaseToken,
        committedAt,
        response,
        securityAudit: {
          id: crypto.randomUUID(),
          requestId: input.execution.requestId,
          siteId: input.execution.siteId,
          actorId: input.execution.actorId,
          credentialId: input.execution.credentialId,
          eventType: "mutation",
          method: input.execution.method,
          routeTemplate: input.execution.routeTemplate,
          outcome: "success",
          metadataJson: JSON.stringify({ status: response.status }),
          createdAt: committedAt,
          expiresAt: new Date(
            Date.parse(committedAt) + 90 * 24 * 60 * 60 * 1_000,
          ).toISOString(),
        },
      };
    },
    markCommitted(response) {
      committed = response;
    },
    committedResponse() {
      return committed;
    },
  };
}

export function attachApiMutationContext(
  context: ActionAPIContext,
  mutation: ApiMutationActionContext,
): ActionAPIContext {
  Reflect.set(context, API_MUTATION_CONTEXT_SYMBOL, mutation);
  return context;
}

export function getApiMutationContext(
  context: ActionAPIContext,
): ApiMutationActionContext | undefined {
  const value = Reflect.get(context, API_MUTATION_CONTEXT_SYMBOL) as unknown;
  return value && typeof value === "object"
    ? (value as ApiMutationActionContext)
    : undefined;
}
