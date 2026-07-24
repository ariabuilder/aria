import { z } from "astro/zod";
import type { SessionUser } from "../auth";
import {
  getCloudflareEnv,
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../cloudflare/env";
import { SiteExportRecordSchema, type SiteExportRecord } from "./schema";

const EXPORT_PREFIX = "_exports/site" as const;
const METADATA_FILE_NAME = "meta.json" as const;

const R2ObjectListSchema = z.object({
  key: z.string().min(1),
});

type SiteExportReadResult = {
  bytes: Uint8Array;
  record: SiteExportRecord;
};

type R2ObjectBodyLike = {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: Uint8Array | string,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ objects?: unknown[] }>;
};

function toArtifactKey(id: string, filename: string): string {
  return `${EXPORT_PREFIX}/${id}/${filename}`;
}

function toMetadataKey(id: string): string {
  return `${EXPORT_PREFIX}/${id}/${METADATA_FILE_NAME}`;
}

function canAccessExport(record: SiteExportRecord, user: SessionUser): boolean {
  return user.role === "administrator" || record.createdBy.id === user.id;
}

function isExpired(record: SiteExportRecord): boolean {
  return Date.now() >= new Date(record.expiresAt).getTime();
}

async function getLocalBaseDir(): Promise<string> {
  const configured = getStringRuntimeSetting("ARIA_EXPORTS_LOCAL_DIR");
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  const path = await import("path");
  return path.resolve(process.cwd(), "aria/storage/exports");
}

async function ensureLocalDirectory(directory: string): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(directory, { recursive: true });
}

async function listLocalExportIds(baseDir: string): Promise<string[]> {
  const fs = await import("fs/promises");

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function readLocalRecord(
  baseDir: string,
  id: string,
): Promise<SiteExportRecord | null> {
  const fs = await import("fs/promises");
  const path = await import("path");

  try {
    const content = await fs.readFile(
      path.join(baseDir, id, METADATA_FILE_NAME),
      "utf-8",
    );
    return SiteExportRecordSchema.parse(JSON.parse(content) as unknown);
  } catch {
    return null;
  }
}

async function deleteLocalExport(baseDir: string, id: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");

  await fs.rm(path.join(baseDir, id), { recursive: true, force: true });
}

function compareNewestFirst(a: SiteExportRecord, b: SiteExportRecord): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function filterAccessibleRecords(
  records: SiteExportRecord[],
  user: SessionUser,
): SiteExportRecord[] {
  return records
    .filter((record) => !isExpired(record) && canAccessExport(record, user))
    .sort(compareNewestFirst);
}

type SiteExportStore = {
  save: (record: SiteExportRecord, bytes: Uint8Array) => Promise<void>;
  listForUser: (user: SessionUser) => Promise<SiteExportRecord[]>;
  getLatestForUser: (user: SessionUser) => Promise<SiteExportRecord | null>;
  readForUser: (
    id: string,
    user: SessionUser,
  ) => Promise<SiteExportReadResult | null>;
  deleteForUser: (id: string, user: SessionUser) => Promise<boolean>;
  cleanupExpired: () => Promise<void>;
};

function createR2Store(locals?: RuntimeLocals): SiteExportStore {
  const env = getCloudflareEnv(locals);
  const bucket = env.aria_r2 as R2BucketLike | undefined;

  if (!bucket) {
    throw new Error("R2 binding missing");
  }

  const r2Bucket: R2BucketLike = bucket;

  async function readRecordByMetadataKey(
    metadataKey: string,
  ): Promise<SiteExportRecord | null> {
    const object = await r2Bucket.get(metadataKey);
    if (!object) {
      return null;
    }

    const raw = await object.text();
    return SiteExportRecordSchema.parse(JSON.parse(raw) as unknown);
  }

  async function listAllRecords(): Promise<SiteExportRecord[]> {
    const listed = await r2Bucket.list({ prefix: `${EXPORT_PREFIX}/` });
    const parsedEntries: Array<
      z.ZodSafeParseResult<z.infer<typeof R2ObjectListSchema>>
    > = (listed.objects ?? []).map((entry: unknown) =>
      R2ObjectListSchema.safeParse(entry),
    );

    const metadataKeys = parsedEntries
      .filter(
        (
          entry: z.ZodSafeParseResult<z.infer<typeof R2ObjectListSchema>>,
        ): entry is z.ZodSafeParseSuccess<z.infer<typeof R2ObjectListSchema>> =>
          entry.success,
      )
      .map(
        (entry: z.ZodSafeParseSuccess<z.infer<typeof R2ObjectListSchema>>) =>
          entry.data.key,
      )
      .filter((key: string) => key.endsWith(`/${METADATA_FILE_NAME}`));

    const records = await Promise.all(
      metadataKeys.map((metadataKey: string) =>
        readRecordByMetadataKey(metadataKey),
      ),
    );

    return records.filter(
      (record: SiteExportRecord | null): record is SiteExportRecord =>
        record !== null,
    );
  }

  return {
    async save(record, bytes) {
      await r2Bucket.put(record.artifactKey, bytes, {
        httpMetadata: {
          contentType: "application/zip",
          contentDisposition: `attachment; filename=\"${record.filename}\"`,
        },
      });

      await r2Bucket.put(record.metadataKey, JSON.stringify(record), {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
        },
      });
    },

    async listForUser(user) {
      const records = await listAllRecords();
      return filterAccessibleRecords(records, user);
    },

    async getLatestForUser(user) {
      const records = await this.listForUser(user);
      return records[0] ?? null;
    },

    async readForUser(id, user) {
      const metadataKey = toMetadataKey(id);
      const record = await readRecordByMetadataKey(metadataKey);

      if (!record || isExpired(record) || !canAccessExport(record, user)) {
        return null;
      }

      const artifact = await r2Bucket.get(record.artifactKey);
      if (!artifact) {
        return null;
      }

      const bytes = new Uint8Array(await artifact.arrayBuffer());
      return { bytes, record };
    },

    async deleteForUser(id, user) {
      const metadataKey = toMetadataKey(id);
      const record = await readRecordByMetadataKey(metadataKey);

      if (!record || !canAccessExport(record, user)) {
        return false;
      }

      await Promise.all([
        r2Bucket.delete(record.artifactKey),
        r2Bucket.delete(record.metadataKey),
      ]);

      return true;
    },

    async cleanupExpired() {
      const records = await listAllRecords();
      const expired = records.filter(isExpired);

      await Promise.all(
        expired.flatMap((record) => [
          r2Bucket.delete(record.artifactKey),
          r2Bucket.delete(record.metadataKey),
        ]),
      );
    },
  };
}

function createLocalStore(): SiteExportStore {
  return {
    async save(record, bytes) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const baseDir = await getLocalBaseDir();
      const exportDir = path.join(baseDir, record.id);

      await ensureLocalDirectory(exportDir);
      await fs.writeFile(path.join(exportDir, record.filename), bytes);
      await fs.writeFile(
        path.join(exportDir, METADATA_FILE_NAME),
        JSON.stringify(record, null, 2),
        "utf-8",
      );
    },

    async listForUser(user) {
      const baseDir = await getLocalBaseDir();
      await ensureLocalDirectory(baseDir);
      const ids = await listLocalExportIds(baseDir);
      const records = await Promise.all(
        ids.map((id) => readLocalRecord(baseDir, id)),
      );

      return filterAccessibleRecords(
        records.filter(
          (record): record is SiteExportRecord => record !== null,
        ),
        user,
      );
    },

    async getLatestForUser(user) {
      const records = await this.listForUser(user);
      return records[0] ?? null;
    },

    async readForUser(id, user) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const baseDir = await getLocalBaseDir();
      const record = await readLocalRecord(baseDir, id);

      if (!record || isExpired(record) || !canAccessExport(record, user)) {
        return null;
      }

      const bytes = new Uint8Array(
        await fs.readFile(path.join(baseDir, id, record.filename)),
      );
      return { bytes, record };
    },

    async deleteForUser(id, user) {
      const baseDir = await getLocalBaseDir();
      const record = await readLocalRecord(baseDir, id);
      if (!record || !canAccessExport(record, user)) {
        return false;
      }

      await deleteLocalExport(baseDir, id);
      return true;
    },

    async cleanupExpired() {
      const baseDir = await getLocalBaseDir();
      await ensureLocalDirectory(baseDir);
      const ids = await listLocalExportIds(baseDir);
      const records = await Promise.all(
        ids.map((id) => readLocalRecord(baseDir, id)),
      );

      await Promise.all(
        records
          .filter((record): record is SiteExportRecord => record !== null)
          .filter(isExpired)
          .map((record) => deleteLocalExport(baseDir, record.id)),
      );
    },
  };
}

export function createSiteExportStore(locals?: RuntimeLocals): SiteExportStore {
  const env = getCloudflareEnv(locals);
  return env.aria_r2 ? createR2Store(locals) : createLocalStore();
}

export function buildSiteExportRecord(input: {
  id: string;
  filename: string;
  createdAt: string;
  expiresAt: string;
  createdBy: SiteExportRecord["createdBy"];
  pageCount: number;
  mediaCount: number;
  cmsCollectionCount?: number;
  cmsEntryCount?: number;
  redirectCount?: number;
  sizeBytes: number;
}): SiteExportRecord {
  return SiteExportRecordSchema.parse({
    id: input.id,
    filename: input.filename,
    artifactKey: toArtifactKey(input.id, input.filename),
    metadataKey: toMetadataKey(input.id),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
    pageCount: input.pageCount,
    mediaCount: input.mediaCount,
    cmsCollectionCount: input.cmsCollectionCount ?? 0,
    cmsEntryCount: input.cmsEntryCount ?? 0,
    redirectCount: input.redirectCount ?? 0,
    sizeBytes: input.sizeBytes,
    downloadPath: `/admin/exports/${input.id}`,
  });
}
