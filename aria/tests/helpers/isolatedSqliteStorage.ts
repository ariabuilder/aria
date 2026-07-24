import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";

export type IsolatedSqliteStorage = {
  adapter: SQLiteStorageAdapter;
  cleanup: () => Promise<void>;
};

export async function createIsolatedSqliteStorage(
  options: {
    seedDesignSystem?: boolean;
  } = {},
): Promise<IsolatedSqliteStorage> {
  const tempDir = await mkdtemp(join(tmpdir(), "aria-test-storage-"));
  const client = createClient({ url: `file:${join(tempDir, "aria.db")}` });
  const adapter = new SQLiteStorageAdapter(client, {
    snapshotDir: join(tempDir, "snapshots"),
    uploadDir: join(tempDir, "uploads"),
    thumbnailsDir: join(tempDir, "thumbnails"),
  });

  if (options.seedDesignSystem) {
    await adapter.saveDesignSystem(createDefaultUniversalDesignSystem());
  }

  return {
    adapter,
    cleanup: async () => {
      client.close();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
