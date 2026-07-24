import type { OrderKind, StorageAdapter } from "../../adapter";

export type AssetOrderStorageDomain = Pick<
  StorageAdapter,
  "getOrder" | "saveOrder"
>;

type AssetOrderStorageContext = {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  now(): string;
};

export function createAssetOrderStorageDomain(
  context: AssetOrderStorageContext,
): AssetOrderStorageDomain {
  return {
    async getOrder(kind: OrderKind): Promise<string[]> {
      const row = await context.queryFirst<{ order_json: string }>(
        `SELECT order_json FROM aria_order WHERE kind = ? LIMIT 1`,
        [kind],
      );
      if (!row) {
        return [];
      }
      try {
        const parsed = JSON.parse(String(row.order_json));
        return Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string")
          : [];
      } catch {
        return [];
      }
    },
    async saveOrder(kind: OrderKind, order: string[]): Promise<void> {
      await context.run(
        `INSERT INTO aria_order (kind, order_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET
           order_json = excluded.order_json,
           updated_at = excluded.updated_at`,
        [kind, JSON.stringify(order), context.now()],
      );
    },
  };
}
