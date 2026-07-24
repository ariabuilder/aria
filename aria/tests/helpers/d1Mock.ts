import type { Client, InValue } from "@libsql/client";

type D1Row = Record<string, unknown>;

export function createD1Mock(client: Client) {
  const createStatement = (sql: string, boundArgs: InValue[] = []) => ({
    __sql: sql,
    __args: boundArgs,
    bind(...values: InValue[]) {
      return createStatement(sql, values);
    },
    async first<T extends D1Row = D1Row>() {
      const result = await client.execute({ sql, args: boundArgs });
      return ((result.rows[0] as unknown as T | undefined) ?? null) as T | null;
    },
    async all<T extends D1Row = D1Row>() {
      const result = await client.execute({ sql, args: boundArgs });
      return {
        results: result.rows as unknown as T[],
      };
    },
    async raw<T extends unknown[][] = unknown[][]>() {
      const result = await client.execute({ sql, args: boundArgs });
      return result.rows.map((row) => Object.values(row)) as T;
    },
    async run() {
      return client.execute({ sql, args: boundArgs });
    },
  });

  return {
    prepare(sql: string) {
      return createStatement(sql);
    },
    async batch(statements: Array<ReturnType<typeof createStatement>>) {
      // D1 batch is transactional. Keeping the mock atomic lets parity tests
      // expose ordering and constraint bugs instead of masking them locally.
      return client.batch(
        statements.map((statement) => ({
          sql: statement.__sql,
          args: statement.__args,
        })),
        "write",
      );
    },
  };
}
