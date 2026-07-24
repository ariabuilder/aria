import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaCatalogRepository } from "../../lib/media/catalog/repository";

const { mockCloudflareEnv } = vi.hoisted(() => ({
  mockCloudflareEnv: {} as Record<string, unknown>,
}));

vi.mock("cloudflare:workers", () => ({
  env: mockCloudflareEnv,
}));

type AssetRow = {
  id: string;
  logical_path: string;
  filename: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number;
  checksum_sha256: string;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by_id: string | null;
  created_by_username: string | null;
  created_by_email: string | null;
  updated_by_id: string | null;
  updated_by_username: string | null;
  updated_by_email: string | null;
  deleted_by_id: string | null;
  deleted_by_username: string | null;
  deleted_by_email: string | null;
};

type LocationRow = {
  id: string;
  media_id: string;
  endpoint_id: string;
  object_key: string;
  public_url: string | null;
  etag: string | null;
  size_bytes: number;
  checksum_sha256: string;
  exists_remote: 0 | 1;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

class InMemoryD1Prepared {
  private args: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly db: InMemoryD1,
  ) {}

  bind(...args: unknown[]): InMemoryD1Prepared {
    this.args = args;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return this.db.first(this.sql, this.args) as T | null;
  }

  async run(): Promise<{ success: true }> {
    this.db.run(this.sql, this.args);
    return { success: true };
  }
}

class InMemoryD1 {
  private assetsById = new Map<string, AssetRow>();
  private assetsByLogicalPath = new Map<string, AssetRow>();
  private locationsByKey = new Map<string, LocationRow>();

  prepare(sql: string): InMemoryD1Prepared {
    return new InMemoryD1Prepared(sql, this);
  }

  getAssetByLogicalPath(logicalPath: string): AssetRow | undefined {
    return this.assetsByLogicalPath.get(logicalPath);
  }

  getLocation(mediaId: string, endpointId: string): LocationRow | undefined {
    return this.locationsByKey.get(`${mediaId}:${endpointId}`);
  }

  first(sql: string, args: unknown[]): unknown {
    if (sql.includes(`SELECT id FROM aria_media_assets WHERE logical_path`)) {
      const logicalPath = String(args[0]);
      const asset = this.assetsByLogicalPath.get(logicalPath);
      return asset ? { id: asset.id } : null;
    }

    if (
      sql.includes("SELECT id, logical_path, mime_type") &&
      sql.includes("FROM aria_media_assets")
    ) {
      const logicalPath = String(args[0]);
      const asset = this.assetsByLogicalPath.get(logicalPath);
      if (!asset) return null;
      return {
        id: asset.id,
        logical_path: asset.logical_path,
        mime_type: asset.mime_type,
      };
    }

    if (sql.includes("SELECT id") && sql.includes("FROM aria_media_locations")) {
      const mediaId = String(args[0]);
      const endpointId = String(args[1]);
      const location = this.locationsByKey.get(`${mediaId}:${endpointId}`);
      return location ? { id: location.id } : null;
    }

    return null;
  }

  run(sql: string, args: unknown[]): void {
    if (sql.includes("INSERT INTO aria_media_assets")) {
      const columnsMatch = sql.match(/INSERT INTO aria_media_assets \(([^)]+)\)/);
      const columns =
        columnsMatch?.[1]?.split(",").map((column) => column.trim()) ?? [];
      const values: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        values[column] = args[index];
      });

      const row: AssetRow = {
        id: String(values.id),
        logical_path: String(values.logical_path),
        filename: String(values.filename),
        extension: values.extension == null ? null : String(values.extension),
        mime_type: values.mime_type == null ? null : String(values.mime_type),
        size_bytes: Number(values.size_bytes),
        checksum_sha256: String(values.checksum_sha256),
        status: String(values.status ?? "active") as AssetRow["status"],
        created_at: String(values.created_at),
        updated_at: String(values.updated_at),
        deleted_at: null,
        created_by_id:
          values.created_by_id == null ? null : String(values.created_by_id),
        created_by_username:
          values.created_by_username == null
            ? null
            : String(values.created_by_username),
        created_by_email:
          values.created_by_email == null
            ? null
            : String(values.created_by_email),
        updated_by_id:
          values.updated_by_id == null ? null : String(values.updated_by_id),
        updated_by_username:
          values.updated_by_username == null
            ? null
            : String(values.updated_by_username),
        updated_by_email:
          values.updated_by_email == null
            ? null
            : String(values.updated_by_email),
        deleted_by_id:
          values.deleted_by_id == null ? null : String(values.deleted_by_id),
        deleted_by_username:
          values.deleted_by_username == null
            ? null
            : String(values.deleted_by_username),
        deleted_by_email:
          values.deleted_by_email == null
            ? null
            : String(values.deleted_by_email),
      };
      this.assetsById.set(row.id, row);
      this.assetsByLogicalPath.set(row.logical_path, row);
      return;
    }

    if (
      sql.includes("UPDATE aria_media_assets") &&
      sql.includes("WHERE id = ?")
    ) {
      const id = String(args[args.length - 1]);
      const existing = this.assetsById.get(id);
      if (!existing) return;

      const setClause = sql.split("SET")[1]?.split("WHERE")[0] ?? "";
      const assignments = setClause
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      let argIndex = 0;

      for (const assignment of assignments) {
        if (assignment.endsWith("= NULL")) {
          const column = assignment.split("=")[0]?.trim();
          if (column === "deleted_at") existing.deleted_at = null;
          if (column === "deleted_by_id") existing.deleted_by_id = null;
          if (column === "deleted_by_username") {
            existing.deleted_by_username = null;
          }
          if (column === "deleted_by_email") existing.deleted_by_email = null;
          continue;
        }

        const literalMatch = assignment.match(/^([a-z_]+)\s*=\s*'([^']*)'/u);
        if (literalMatch) {
          const [, column, literalValue] = literalMatch;
          if (column === "status") {
            existing.status = literalValue as AssetRow["status"];
          }
          continue;
        }

        const column = assignment.split("=")[0]?.trim();
        const value = args[argIndex];
        argIndex += 1;
        if (!column) continue;

        switch (column) {
          case "filename":
            existing.filename = String(value);
            break;
          case "extension":
            existing.extension = value == null ? null : String(value);
            break;
          case "mime_type":
            existing.mime_type = value == null ? null : String(value);
            break;
          case "size_bytes":
            existing.size_bytes = Number(value);
            break;
          case "checksum_sha256":
            existing.checksum_sha256 = String(value);
            break;
          case "status":
            existing.status = String(value) as AssetRow["status"];
            break;
          case "deleted_at":
            existing.deleted_at = value == null ? null : String(value);
            break;
          case "updated_at":
            existing.updated_at = String(value);
            break;
          case "logical_path": {
            this.assetsByLogicalPath.delete(existing.logical_path);
            existing.logical_path = String(value);
            this.assetsByLogicalPath.set(existing.logical_path, existing);
            break;
          }
          case "created_by_id":
            existing.created_by_id = value == null ? null : String(value);
            break;
          case "created_by_username":
            existing.created_by_username =
              value == null ? null : String(value);
            break;
          case "created_by_email":
            existing.created_by_email = value == null ? null : String(value);
            break;
          case "updated_by_id":
            existing.updated_by_id = value == null ? null : String(value);
            break;
          case "updated_by_username":
            existing.updated_by_username =
              value == null ? null : String(value);
            break;
          case "updated_by_email":
            existing.updated_by_email = value == null ? null : String(value);
            break;
          case "deleted_by_id":
            existing.deleted_by_id = value == null ? null : String(value);
            break;
          case "deleted_by_username":
            existing.deleted_by_username =
              value == null ? null : String(value);
            break;
          case "deleted_by_email":
            existing.deleted_by_email = value == null ? null : String(value);
            break;
          default:
            break;
        }
      }

      this.assetsByLogicalPath.set(existing.logical_path, existing);
      return;
    }

    if (sql.includes("INSERT INTO aria_media_locations")) {
      const row: LocationRow = {
        id: String(args[0]),
        media_id: String(args[1]),
        endpoint_id: String(args[2]),
        object_key: String(args[3]),
        public_url: args[4] == null ? null : String(args[4]),
        etag: args[5] == null ? null : String(args[5]),
        size_bytes: Number(args[6]),
        checksum_sha256: String(args[7]),
        exists_remote: 1,
        last_verified_at: args[8] == null ? null : String(args[8]),
        created_at: String(args[9]),
        updated_at: String(args[10]),
      };
      this.locationsByKey.set(`${row.media_id}:${row.endpoint_id}`, row);
      return;
    }

    if (
      sql.includes("UPDATE aria_media_locations") &&
      sql.includes("WHERE id = ?")
    ) {
      const id = String(args[7]);
      const location = Array.from(this.locationsByKey.values()).find(
        (item) => item.id === id,
      );
      if (!location) return;

      location.object_key = String(args[0]);
      location.public_url = args[1] == null ? null : String(args[1]);
      location.etag = args[2] == null ? null : String(args[2]);
      location.size_bytes = Number(args[3]);
      location.checksum_sha256 = String(args[4]);
      location.exists_remote = 1;
      location.last_verified_at = args[5] == null ? null : String(args[5]);
      location.updated_at = String(args[6]);
      return;
    }

    if (
      sql.includes("UPDATE aria_media_locations") &&
      sql.includes("SET exists_remote = 0")
    ) {
      const mediaId = String(args[2]);
      for (const location of this.locationsByKey.values()) {
        if (location.media_id !== mediaId) continue;
        location.exists_remote = 0;
        location.last_verified_at = String(args[0]);
        location.updated_at = String(args[1]);
      }
    }
  }
}

function createRepositoryWithDb() {
  const db = new InMemoryD1();
  const repository = MediaCatalogRepository.tryCreate({
    cfBindings: { aria_db: db as never },
  });

  if (!repository) {
    throw new Error("Failed to create media catalog repository");
  }

  return { db, repository };
}

describe("MediaCatalogRepository mutations", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockCloudflareEnv)) {
      delete mockCloudflareEnv[key];
    }
  });

  it("marks asset and locations deleted", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";

    const created = await repository.upsertUploadedMedia({
      logicalPath: "/uploads/gallery/hero.jpg",
      filename: "hero.jpg",
      extension: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
      checksumSha256: "abc123",
      endpointId: "local-fs",
      objectKey: "gallery/hero.jpg",
      publicUrl: "/uploads/gallery/hero.jpg",
      updatedAt: now,
    });

    const result = await repository.markDeleted({
      logicalPath: "/uploads/gallery/hero.jpg",
      updatedAt: now,
    });

    expect(result.found).toBe(true);

    const asset = db.getAssetByLogicalPath("/uploads/gallery/hero.jpg");
    expect(asset?.status).toBe("deleted");
    expect(asset?.deleted_at).toBe(now);

    const location = db.getLocation(created.mediaId, "local-fs");
    expect(location?.exists_remote).toBe(0);
  });

  it("moves catalog record to the new logical path", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";

    const created = await repository.upsertUploadedMedia({
      logicalPath: "/uploads/gallery/hero.jpg",
      filename: "hero.jpg",
      extension: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
      checksumSha256: "abc123",
      endpointId: "local-fs",
      objectKey: "gallery/hero.jpg",
      publicUrl: "/uploads/gallery/hero.jpg",
      updatedAt: now,
    });

    const moved = await repository.moveMedia({
      oldLogicalPath: "/uploads/gallery/hero.jpg",
      newLogicalPath: "/uploads/gallery/hero-renamed.jpg",
      filename: "hero-renamed.jpg",
      extension: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: 321,
      checksumSha256: "def456",
      endpointId: "local-fs",
      objectKey: "gallery/hero-renamed.jpg",
      publicUrl: "/uploads/gallery/hero-renamed.jpg",
      updatedAt: now,
    });

    expect(moved.moved).toBe(true);
    expect(moved.logicalPath).toBe("/uploads/gallery/hero-renamed.jpg");

    const oldAsset = db.getAssetByLogicalPath("/uploads/gallery/hero.jpg");
    expect(oldAsset).toBeUndefined();

    const newAsset = db.getAssetByLogicalPath(
      "/uploads/gallery/hero-renamed.jpg",
    );
    expect(newAsset?.id).toBe(created.mediaId);

    const location = db.getLocation(created.mediaId, "local-fs");
    expect(location?.object_key).toBe("gallery/hero-renamed.jpg");
    expect(location?.exists_remote).toBe(1);
  });

  it("stamps updated_by on moveMedia when authorship is provided", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";
    const actor = {
      id: "user-move-1",
      username: "mover",
      email: "mover@example.com",
    };

    await repository.upsertUploadedMedia(
      {
        logicalPath: "/uploads/move/source.jpg",
        filename: "source.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 50,
        checksumSha256: "move123",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor, mutationKind: "create" },
    );

    await repository.moveMedia(
      {
        oldLogicalPath: "/uploads/move/source.jpg",
        newLogicalPath: "/uploads/move/target.jpg",
        filename: "target.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 50,
        checksumSha256: "move456",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor, mutationKind: "update" },
    );

    const moved = db.getAssetByLogicalPath("/uploads/move/target.jpg");
    expect(moved?.created_by_id).toBe(actor.id);
    expect(moved?.updated_by_id).toBe(actor.id);
  });

  it("creates a new catalog record when move source is missing", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";

    const result = await repository.moveMedia({
      oldLogicalPath: "/uploads/missing.jpg",
      newLogicalPath: "/uploads/new.jpg",
      filename: "new.jpg",
      extension: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      checksumSha256: "xyz789",
      endpointId: "local-fs",
      objectKey: "new.jpg",
      publicUrl: "/uploads/new.jpg",
      updatedAt: now,
    });

    expect(result.moved).toBe(false);
    expect(result.logicalPath).toBe("/uploads/new.jpg");

    const newAsset = db.getAssetByLogicalPath("/uploads/new.jpg");
    expect(newAsset?.status).toBe("active");
  });

  it("stamps authorship columns on create, delete, and restore", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";
    const actor = {
      id: "user-media-1",
      username: "media-editor",
      email: "media@example.com",
    };

    await repository.upsertUploadedMedia(
      {
        logicalPath: "/uploads/auth/photo.jpg",
        filename: "photo.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        checksumSha256: "abc123",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor, mutationKind: "create" },
    );

    const created = db.getAssetByLogicalPath("/uploads/auth/photo.jpg");
    expect(created?.created_by_id).toBe(actor.id);
    expect(created?.updated_by_id).toBe(actor.id);

    await repository.markDeleted(
      { logicalPath: "/uploads/auth/photo.jpg", updatedAt: now },
      { actor, mutationKind: "delete" },
    );

    const deleted = db.getAssetByLogicalPath("/uploads/auth/photo.jpg");
    expect(deleted?.status).toBe("deleted");
    expect(deleted?.deleted_by_id).toBe(actor.id);

    await repository.upsertUploadedMedia(
      {
        logicalPath: "/uploads/auth/photo.jpg",
        filename: "photo.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        checksumSha256: "abc123",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor, mutationKind: "restore" },
    );

    const restored = db.getAssetByLogicalPath("/uploads/auth/photo.jpg");
    expect(restored?.status).toBe("active");
    expect(restored?.deleted_by_id).toBeNull();
    expect(restored?.created_by_id).toBe(actor.id);
  });

  it("stamps created_by and updated_by when duplicate creates a new catalog row", async () => {
    const { db, repository } = createRepositoryWithDb();
    const now = "2026-02-16T00:00:00.000Z";
    const sourceActor = {
      id: "user-source-1",
      username: "source-uploader",
      email: "source@example.com",
    };
    const duplicateActor = {
      id: "user-dup-1",
      username: "duplicator",
      email: "dup@example.com",
    };

    await repository.upsertUploadedMedia(
      {
        logicalPath: "/uploads/dup/original.jpg",
        filename: "original.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 80,
        checksumSha256: "orig111",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor: sourceActor, mutationKind: "create" },
    );

    await repository.upsertUploadedMedia(
      {
        logicalPath: "/uploads/dup/original-copy.jpg",
        filename: "original-copy.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 80,
        checksumSha256: "dup222",
        endpointId: "local-fs",
        updatedAt: now,
      },
      { actor: duplicateActor, mutationKind: "create" },
    );

    const duplicate = db.getAssetByLogicalPath("/uploads/dup/original-copy.jpg");
    expect(duplicate?.created_by_id).toBe(duplicateActor.id);
    expect(duplicate?.updated_by_id).toBe(duplicateActor.id);
    expect(duplicate?.created_by_id).not.toBe(sourceActor.id);
  });
});
