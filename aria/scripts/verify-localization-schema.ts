import { createClient } from "@libsql/client";
import path from "node:path";

import {
  formatLocalizationSchemaVerificationFailure,
  verifyLocalizationSchema,
} from "../lib/storage/verifyLocalizationSchema";
import { createRemoteD1Database } from "../lib/storage/remote-d1";

const requestedPath = process.argv.find((argument) =>
  argument.startsWith("--db="),
);
const remote = process.argv.includes("--remote");
if (remote && requestedPath) {
  throw new Error("--remote and --db cannot be used together");
}
const dbPath = path.resolve(
  process.cwd(),
  requestedPath?.slice("--db=".length) ?? "aria/storage/aria.db",
);

const localClient = remote
  ? undefined
  : createClient({ url: `file:${dbPath}` });
const remoteDatabase = remote
  ? await createRemoteD1Database(process.env.ARIA_D1_BINDING || "aria_db", {
      remote: true,
    })
  : undefined;

try {
  const verifierClient = remote
    ? {
        async execute(sql: string, args: readonly unknown[] = []) {
          const query = await remoteDatabase!
            .prepare(sql)
            .bind(...args)
            .all();
          return { rows: (query.results ?? []) as Record<string, unknown>[] };
        },
      }
    : {
        async execute(sql: string, args: readonly unknown[] = []) {
          const query = await localClient!.execute({ sql, args: args as any });
          return { rows: query.rows as Record<string, unknown>[] };
        },
      };
  const result = await verifyLocalizationSchema(verifierClient);

  if (!result.ok) {
    console.error(formatLocalizationSchemaVerificationFailure(result));
    process.exitCode = 1;
  } else {
    console.log(
      `Pre-release baseline schema verified: ${remote ? "remote D1" : dbPath}`,
    );
  }
} finally {
  localClient?.close();
}
