/**
 * D1 access for Node CLI tools via the Cloudflare HTTP API (parameterized queries).
 * Avoids wrangler `d1 execute --file` 100 KB statement limits for large JSON payloads.
 */

import type { RemoteD1DatabaseLike } from "./d1-database-types";
import {
  parseD1BindingFromWrangler,
  readWranglerToml,
} from "./wrangler-config";
import { resolveCloudflareAccountId } from "../../scripts/lib/cloudflare-account";

type D1HttpQueryRow = Record<string, unknown>;

type D1HttpQueryResult = {
  results?: D1HttpQueryRow[];
  success?: boolean;
  meta?: {
    changes?: number;
    [key: string]: unknown;
  };
};

type D1HttpPreparedStatement = {
  bind(...values: unknown[]): D1HttpPreparedStatement;
  first<T extends D1HttpQueryRow = D1HttpQueryRow>(): Promise<T | null>;
  all<T extends D1HttpQueryRow = D1HttpQueryRow>(): Promise<{
    results?: T[];
  }>;
  run(): Promise<unknown>;
};

/** Reads the Cloudflare API token required for D1 HTTP requests. */
function readApiToken(): string {
  const token =
    process.env.ARIA_CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.ARIA_CF_API_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "ARIA_CLOUDFLARE_API_TOKEN is required for remote D1 content push (use .env — not CLOUDFLARE_API_TOKEN, which Wrangler also uses for deploy). Create a token with D1 Edit: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
    );
  }

  return token;
}

/** Executes one SQL statement through the Cloudflare D1 HTTP API. */
async function executeD1HttpQuery(input: {
  accountId: string;
  databaseId: string;
  sql: string;
  params?: readonly unknown[];
}): Promise<D1HttpQueryResult> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/d1/database/${input.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readApiToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: input.sql,
        params: input.params ?? [],
      }),
    },
  );

  const payload = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: D1HttpQueryResult[];
  };

  if (!response.ok || !payload.success) {
    const message =
      payload.errors
        /** Extracts Cloudflare error messages from a failed D1 response. */
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ") || `D1 HTTP query failed (${response.status})`;
    throw new Error(message);
  }

  const first = payload.result?.[0];

  if (!first?.success) {
    throw new Error("D1 HTTP query returned an unsuccessful result");
  }

  return first;
}

/** Creates a prepared-statement facade for D1 HTTP queries. */
function createHttpPreparedStatement(input: {
  accountId: string;
  databaseId: string;
  sql: string;
  args?: readonly unknown[];
}): D1HttpPreparedStatement {
  const args = input.args ?? [];

  return {
    /** Binds positional values to this D1 HTTP statement. */
    bind(...values: unknown[]) {
      return createHttpPreparedStatement({
        ...input,
        args: values,
      });
    },
    /** Executes the statement and returns its first row. */
    async first<T extends D1HttpQueryRow = D1HttpQueryRow>() {
      const result = await executeD1HttpQuery({
        accountId: input.accountId,
        databaseId: input.databaseId,
        sql: input.sql,
        params: args,
      });

      return (result.results?.[0] ?? null) as T | null;
    },
    /** Executes the statement and returns every result row. */
    async all<T extends D1HttpQueryRow = D1HttpQueryRow>() {
      const result = await executeD1HttpQuery({
        accountId: input.accountId,
        databaseId: input.databaseId,
        sql: input.sql,
        params: args,
      });

      return {
        results: (result.results ?? []) as T[],
      };
    },
    /** Executes the statement and returns the raw D1 result. */
    async run() {
      return executeD1HttpQuery({
        accountId: input.accountId,
        databaseId: input.databaseId,
        sql: input.sql,
        params: args,
      });
    },
  };
}

/** Creates a remote D1 adapter that sends statements through Cloudflare's API. */
export async function createD1HttpDatabase(input?: {
  binding?: string;
  accountId?: string;
  databaseId?: string;
}): Promise<RemoteD1DatabaseLike> {
  const binding = input?.binding ?? process.env.ARIA_D1_BINDING ?? "aria_db";
  const wranglerConfig = parseD1BindingFromWrangler(
    readWranglerToml(),
    binding,
  );
  const accountId = input?.accountId ?? (await resolveCloudflareAccountId());
  const databaseId = input?.databaseId ?? wranglerConfig.databaseId;

  return {
    /** Prepares SQL for execution through the D1 HTTP API. */
    prepare(sql: string) {
      return createHttpPreparedStatement({
        accountId,
        databaseId,
        sql,
      });
    },
    /** Executes a group of prepared D1 HTTP statements in order. */
    async batch(statements: D1HttpPreparedStatement[]) {
      const results: Array<{ results?: D1HttpQueryRow[] }> = [];

      for (const statement of statements) {
        const runResult = await statement.run();
        const parsed = runResult as D1HttpQueryResult;
        results.push({ results: parsed.results ?? [] });
      }

      return results;
    },
  };
}
