import { createD1HttpDatabase } from "./d1-http-database";
import type {
  D1PreparedStatementLike,
  D1QueryRow,
  RemoteD1DatabaseLike,
} from "./d1-database-types";
import { D1_SAFE_INLINE_STATEMENT_BYTES } from "./push-validation";
import { resolveWranglerConfigPath } from "./wrangler-config";
import { runWrangler } from "../../scripts/lib/wrangler-command";

export type {
  D1PreparedStatementLike,
  RemoteD1DatabaseLike,
} from "./d1-database-types";

type RemoteD1Result<T extends D1QueryRow = D1QueryRow> = {
  results?: T[];
  success?: boolean;
  meta?: {
    changes?: number;
    [key: string]: unknown;
  };
};

type RemotePreparedStatement = D1PreparedStatementLike & {
  toSQL(): string;
};

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolateSql(sql: string, args: readonly unknown[]): string {
  const placeholderCount = (sql.match(/\?/g) ?? []).length;

  if (placeholderCount !== args.length) {
    throw new Error(
      `Remote D1 placeholder mismatch: expected ${placeholderCount}, received ${args.length}`,
    );
  }

  let nextIndex = 0;
  return sql.replace(/\?/g, () => sqlLiteral(args[nextIndex++]));
}

async function executeLiteralRemoteSql<T extends D1QueryRow>(input: {
  binding: string;
  sql: string;
  remote: boolean;
}): Promise<RemoteD1Result<T>> {
  if (Buffer.byteLength(input.sql, "utf8") > D1_SAFE_INLINE_STATEMENT_BYTES) {
    throw new Error(
      "SQL statement exceeds D1 safe inline limit. Set ARIA_CLOUDFLARE_API_TOKEN and use parameterized D1 HTTP access (push:remote).",
    );
  }

  // Always pin the active root config so a private wrangler.toml (real IDs)
  // wins over the committed wrangler.jsonc (placeholder IDs); wrangler's own
  // discovery order would pick the jsonc first.
  const configPath = resolveWranglerConfigPath();
  const args = [
    "d1",
    "execute",
    input.binding,
    input.remote ? "--remote" : "--local",
    "--yes",
    "--json",
    "--command",
    input.sql,
    ...(configPath ? ["--config", configPath] : []),
  ];

  const { stdout } = await runWrangler(args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const parsed = JSON.parse(stdout) as RemoteD1Result<T>[];
  const first = parsed[0];

  if (!first?.success) {
    throw new Error(`Remote D1 query failed for binding ${input.binding}`);
  }

  return first;
}

function createLiteralPreparedStatement(input: {
  binding: string;
  sql: string;
  remote: boolean;
  args?: readonly unknown[];
}): RemotePreparedStatement {
  const args = input.args ?? [];

  return {
    bind(...values: unknown[]) {
      return createLiteralPreparedStatement({
        ...input,
        args: values,
      });
    },
    toSQL() {
      return interpolateSql(input.sql, args);
    },
    async first<T extends D1QueryRow = D1QueryRow>() {
      const result = await executeLiteralRemoteSql<T>({
        binding: input.binding,
        sql: interpolateSql(input.sql, args),
        remote: input.remote,
      });

      return (result.results?.[0] ?? null) as T | null;
    },
    async all<T extends D1QueryRow = D1QueryRow>() {
      const result = await executeLiteralRemoteSql<T>({
        binding: input.binding,
        sql: interpolateSql(input.sql, args),
        remote: input.remote,
      });

      return {
        results: result.results ?? [],
      };
    },
    async run() {
      return executeLiteralRemoteSql({
        binding: input.binding,
        sql: interpolateSql(input.sql, args),
        remote: input.remote,
      });
    },
  };
}

function createLiteralWranglerD1Database(
  binding: string,
  remote: boolean,
): RemoteD1DatabaseLike {
  return {
    prepare(sql: string) {
      return createLiteralPreparedStatement({ binding, sql, remote });
    },
    async batch(statements: D1PreparedStatementLike[]) {
      const results: Array<{ results?: D1QueryRow[] }> = [];

      for (const statement of statements) {
        const sql = (statement as RemotePreparedStatement).toSQL?.();
        if (!sql) {
          throw new Error(
            "Remote D1 batch received a non-remote prepared statement",
          );
        }

        const result = await executeLiteralRemoteSql({ binding, sql, remote });
        results.push({ results: result.results ?? [] });
      }

      return results;
    },
  };
}

function hasAriaCloudflareApiToken(): boolean {
  return Boolean(
    process.env.ARIA_CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.ARIA_CF_API_TOKEN?.trim(),
  );
}

export async function createRemoteD1Database(
  binding = process.env.ARIA_D1_BINDING || "aria_db",
  options: { remote?: boolean } = {},
): Promise<RemoteD1DatabaseLike> {
  const remote = options.remote !== false;

  if (remote && hasAriaCloudflareApiToken()) {
    return createD1HttpDatabase({ binding });
  }

  return createLiteralWranglerD1Database(binding, remote);
}
