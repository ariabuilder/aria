/**
 * Cloudflare Analytics GraphQL client.
 */

import { log as baseLog } from "../../utils/logger";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export type CloudflareGraphqlErrorCode =
  | "http_error"
  | "graphql_error"
  | "analytics_forbidden"
  | "no_data";

export class CloudflareGraphqlError extends Error {
  readonly code: CloudflareGraphqlErrorCode;

  constructor(
    message: string,
    code: CloudflareGraphqlErrorCode,
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CloudflareGraphqlError";
    this.code = code;
  }
}

function extractErrorMessages(details: unknown): string[] {
  if (!details) {
    return [];
  }
  if (Array.isArray(details)) {
    return details
      .map((entry) =>
        typeof entry === "object" && entry && "message" in entry
          ? String((entry as { message?: string }).message ?? "")
          : "",
      )
      .filter(Boolean);
  }
  return [];
}

export function isAnalyticsReadForbiddenError(
  error: unknown,
): boolean {
  if (error instanceof CloudflareGraphqlError) {
    if (error.code === "analytics_forbidden") {
      return true;
    }
  }

  const messages =
    error instanceof CloudflareGraphqlError
      ? [error.message, ...extractErrorMessages(error.details)]
      : error instanceof Error
        ? [error.message]
        : [];

  const haystack = messages.join(" ").toLowerCase();
  return (
    haystack.includes("analytics.read") ||
    haystack.includes("zone.analytics") ||
    haystack.includes("zone analytics")
  );
}

function classifyGraphqlErrorMessage(
  message: string,
  statusCode?: number,
): CloudflareGraphqlErrorCode {
  const haystack = message.toLowerCase();
  if (
    haystack.includes("analytics.read") ||
    haystack.includes("zone.analytics")
  ) {
    return "analytics_forbidden";
  }
  if (statusCode === 401 || statusCode === 403) {
    return "analytics_forbidden";
  }
  return "graphql_error";
}

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export async function executeCloudflareGraphQL<T>(options: {
  apiToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: options.query,
      variables: options.variables ?? {},
    }),
  });

  const body = (await response.json()) as GraphqlEnvelope<T>;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CloudflareGraphqlError(
        "Cloudflare analytics credentials rejected",
        "analytics_forbidden",
        response.status,
        body,
      );
    }
    throw new CloudflareGraphqlError(
      `Cloudflare GraphQL HTTP ${response.status}`,
      "http_error",
      response.status,
      body,
    );
  }

  if (body.errors?.length) {
    baseLog("warn", "[Cloudflare GraphQL] query errors", {
      errors: body.errors.map((entry) => entry.message),
    });
    const message =
      body.errors[0]?.message ?? "Cloudflare GraphQL query failed";
    throw new CloudflareGraphqlError(
      message,
      classifyGraphqlErrorMessage(message, response.status),
      response.status,
      body.errors,
    );
  }

  if (!body.data) {
    throw new CloudflareGraphqlError(
      "Cloudflare GraphQL returned no data",
      "no_data",
    );
  }

  return body.data;
}
