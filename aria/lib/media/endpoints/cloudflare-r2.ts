import type {
  MediaEndpoint,
  MediaListOptions,
  MediaListResult,
  MediaObjectRef,
  MediaSyncCapabilities,
} from "../types";
import { normalizeMediaKey } from "../utils/key";
import { computeSHA256 } from "../utils/checksum";

type R2HeadObject = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: Date;
  checksums?: {
    sha256?: string;
  };
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
};

type R2ListObject = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: Date;
  checksums?: {
    sha256?: string;
  };
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
};

type R2ListResult = {
  objects: R2ListObject[];
  truncated: boolean;
  cursor?: string;
};

export type CloudflareR2Bucket = {
  head: (key: string) => Promise<R2HeadObject | null>;
  list: (opts?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<R2ListResult>;
  put: (
    key: string,
    value: BodyInit | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ) => Promise<R2HeadObject>;
  get: (key: string) => Promise<null | {
    arrayBuffer: () => Promise<ArrayBuffer>;
  }>;
  delete: (key: string) => Promise<void>;
};

type CloudflareR2EndpointOptions = {
  bucket: CloudflareR2Bucket;
  baseUrl?: string;
};

const MEDIA_OBJECT_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

export class CloudflareR2Endpoint implements MediaEndpoint {
  readonly id = "cloudflare-r2";
  readonly kind = "cloudflare-r2" as const;

  private readonly bucket: CloudflareR2Bucket;
  private readonly baseUrl: string;

  constructor(options: CloudflareR2EndpointOptions) {
    this.bucket = options.bucket;
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  }

  async capabilities(): Promise<MediaSyncCapabilities> {
    return {
      checksum: true,
      etag: true,
      versioning: false,
      batchDelete: true,
      batchPut: false,
      signedUrlRead: true,
      signedUrlWrite: true,
    };
  }

  async list(options?: MediaListOptions): Promise<MediaListResult> {
    const prefix = options?.prefix
      ? normalizeMediaKey(options.prefix)
      : undefined;
    const limit =
      options?.limit !== undefined
        ? Math.max(1, Math.min(1000, Math.trunc(options.limit)))
        : 1000;

    const listed = await this.bucket.list({
      prefix,
      cursor: options?.cursor,
      limit,
    });

    return {
      objects: listed.objects.map((item: R2ListObject) =>
        this.toObjectRef(item),
      ),
      nextCursor: listed.truncated ? listed.cursor : undefined,
    };
  }

  async head(key: string): Promise<MediaObjectRef | null> {
    const normalized = normalizeMediaKey(key);
    const object = await this.bucket.head(normalized);
    if (!object) return null;
    return this.toObjectRef(object);
  }

  async get(key: string): Promise<Buffer | null> {
    const normalized = normalizeMediaKey(key);
    const object = await this.bucket.get(normalized);
    if (!object) return null;

    const arrayBuffer = await object.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async put(
    key: string,
    data: Buffer,
    meta?: { mimeType?: string },
  ): Promise<MediaObjectRef> {
    const normalized = normalizeMediaKey(key);
    const checksum = computeSHA256(data);

    const payload = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    const options = {
      httpMetadata: meta?.mimeType
        ? {
            contentType: meta.mimeType,
            cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
          }
        : {
            cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
          },
    } as const;

    let stored: R2HeadObject;
    try {
      stored = await this.bucket.put(normalized, payload, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`R2 put failed for ${normalized}: ${message}`);
    }

    return this.toObjectRef(stored, checksum);
  }

  async delete(key: string): Promise<void> {
    const normalized = normalizeMediaKey(key);
    await this.bucket.delete(normalized);
  }

  private toObjectRef(
    item: R2HeadObject | R2ListObject,
    fallbackChecksum?: string,
  ): MediaObjectRef {
    const key = normalizeMediaKey(item.key);
    return {
      key,
      url: this.baseUrl ? `${this.baseUrl}/${key}` : undefined,
      sizeBytes: item.size,
      etag: item.etag,
      checksumSha256: item.checksums?.sha256 ?? fallbackChecksum,
      mimeType: item.httpMetadata?.contentType,
      updatedAt: item.uploaded?.toISOString(),
    };
  }
}
