import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type {
  MediaEndpoint,
  MediaListOptions,
  MediaListResult,
  MediaObjectRef,
  MediaSyncCapabilities,
} from "../types";
import { normalizeMediaKey } from "../utils/key";
import { computeSHA256 } from "../utils/checksum";

type LocalMediaEndpointOptions = {
  rootDir?: string;
  baseUrl?: string;
};

export class LocalMediaEndpoint implements MediaEndpoint {
  readonly id = "local-fs";
  readonly kind = "local" as const;

  private readonly rootDir: string;
  private readonly baseUrl: string;

  constructor(options?: LocalMediaEndpointOptions) {
    this.rootDir = options?.rootDir ?? path.resolve("./public/uploads");
    this.baseUrl = options?.baseUrl ?? "/uploads";
  }

  async capabilities(): Promise<MediaSyncCapabilities> {
    return {
      checksum: true,
      etag: false,
      versioning: false,
      batchDelete: false,
      batchPut: false,
      signedUrlRead: false,
      signedUrlWrite: false,
    };
  }

  async list(options?: MediaListOptions): Promise<MediaListResult> {
    const prefix = options?.prefix ? normalizeMediaKey(options.prefix) : "";
    const limit = options?.limit ?? 1000;
    const startDir = prefix ? path.join(this.rootDir, prefix) : this.rootDir;

    const objects: MediaObjectRef[] = [];

    const walk = async (directory: string): Promise<void> => {
      let entries: Dirent[] = [];
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (objects.length >= limit) return;

        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.isFile() || entry.name.endsWith(".meta.json")) continue;

        const stats = await fs.stat(fullPath);
        const key = normalizeMediaKey(path.relative(this.rootDir, fullPath));
        objects.push({
          key,
          url: `${this.baseUrl}/${key}`,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
        });
      }
    };

    await walk(startDir);
    return { objects };
  }

  async head(key: string): Promise<MediaObjectRef | null> {
    const normalized = normalizeMediaKey(key);
    const fullPath = path.join(this.rootDir, normalized);

    try {
      const stats = await fs.stat(fullPath);
      return {
        key: normalized,
        url: `${this.baseUrl}/${normalized}`,
        sizeBytes: stats.size,
        updatedAt: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const normalized = normalizeMediaKey(key);
    const fullPath = path.join(this.rootDir, normalized);

    try {
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    data: Buffer,
    meta?: { mimeType?: string },
  ): Promise<MediaObjectRef> {
    const normalized = normalizeMediaKey(key);
    const fullPath = path.join(this.rootDir, normalized);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);

    const stats = await fs.stat(fullPath);
    return {
      key: normalized,
      url: `${this.baseUrl}/${normalized}`,
      sizeBytes: stats.size,
      mimeType: meta?.mimeType,
      checksumSha256: computeSHA256(data),
      updatedAt: stats.mtime.toISOString(),
    };
  }

  async delete(key: string): Promise<void> {
    const normalized = normalizeMediaKey(key);
    const fullPath = path.join(this.rootDir, normalized);
    await fs.unlink(fullPath);
  }
}
