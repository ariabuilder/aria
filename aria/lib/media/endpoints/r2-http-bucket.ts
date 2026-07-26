/**
 * R2 bucket access for Node CLI via the Cloudflare HTTP API.
 * Requires an API token with R2 read/write on the target bucket.
 */

import type { CloudflareR2Bucket } from "./cloudflare-r2";
import {
  parseR2BindingFromWrangler,
  readR2PublicUrlFromWrangler,
  readWranglerToml,
} from "../../storage/wrangler-config";
import { resolveCloudflareAccountId } from "../../../scripts/lib/cloudflare-account";

/** Reads the Cloudflare API token required for R2 HTTP requests. */
function readApiToken(): string {
  const token =
    process.env.ARIA_CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.ARIA_CF_API_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "ARIA_CLOUDFLARE_API_TOKEN is required for remote R2 media push (R2 read/write on the bucket).",
    );
  }

  return token;
}

type R2ApiObject = {
  key?: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  httpMetadata?: { contentType?: string };
  checksums?: { sha256?: string };
};

/** Encodes each segment of an R2 object key without losing path separators. */
function encodeObjectKey(key: string): string {
  return (
    key
      .split("/")
      /** Encodes one object-key segment while retaining slash separators. */
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  );
}

/** Sends an authenticated request to the Cloudflare R2 API. */
async function r2ApiFetch(input: {
  accountId: string;
  bucketName: string;
  objectKey?: string;
  method: string;
  searchParams?: URLSearchParams;
  body?: BodyInit;
  contentType?: string;
}): Promise<Response> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/r2/buckets/${input.bucketName}/objects`;
  const path = input.objectKey
    ? `${base}/${encodeObjectKey(input.objectKey)}`
    : base;
  const url = input.searchParams
    ? `${path}?${input.searchParams.toString()}`
    : path;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${readApiToken()}`,
  };

  if (input.contentType) {
    headers["Content-Type"] = input.contentType;
  }

  return fetch(url, {
    method: input.method,
    headers,
    body: input.body,
  });
}

/** Creates an R2 bucket adapter backed by Cloudflare's HTTP API. */
export async function createRemoteR2HttpBucket(input?: {
  bucketName?: string;
}): Promise<CloudflareR2Bucket> {
  const toml = readWranglerToml();
  const binding = parseR2BindingFromWrangler(toml);
  const bucketName = input?.bucketName ?? binding.bucketName;
  const accountId = await resolveCloudflareAccountId();
  const publicUrl = readR2PublicUrlFromWrangler(toml);

  void publicUrl;

  const _bucket: CloudflareR2Bucket = {
    /** Reads object metadata without downloading its body. */
    async head(key: string) {
      const response = await r2ApiFetch({
        accountId,
        bucketName,
        objectKey: key,
        method: "HEAD",
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`R2 head failed for ${key} (${response.status})`);
      }

      return {
        key,
        size: Number(response.headers.get("content-length") ?? 0) || undefined,
        etag: response.headers.get("etag") ?? undefined,
        httpMetadata: {
          contentType: response.headers.get("content-type") ?? undefined,
        },
      };
    },

    /** Lists objects using the requested prefix, cursor, and limit. */
    async list(opts) {
      const searchParams = new URLSearchParams();
      if (opts?.prefix) {
        searchParams.set("prefix", opts.prefix);
      }
      if (opts?.cursor) {
        searchParams.set("cursor", opts.cursor);
      }
      if (opts?.limit) {
        searchParams.set("limit", String(opts.limit));
      }

      const response = await r2ApiFetch({
        accountId,
        bucketName,
        method: "GET",
        searchParams,
      });

      const payload = (await response.json()) as {
        success?: boolean;
        result?: R2ApiObject[];
        result_info?: { cursor?: string; is_truncated?: boolean };
        errors?: Array<{ message?: string }>;
      };

      if (!response.ok || !payload.success) {
        const message =
          payload.errors
            /** Extracts Cloudflare error messages for a readable failure. */
            ?.map((error) => error.message)
            .join("; ") || `R2 list failed (${response.status})`;
        throw new Error(message);
      }

      const objects = (payload.result ?? []).map(
        /** Converts an R2 API item into the bucket adapter's object shape. */
        (item) => ({
          key: item.key ?? "",
          size: item.size,
          etag: item.etag,
          uploaded: item.uploaded ? new Date(item.uploaded) : undefined,
          httpMetadata: item.httpMetadata,
          checksums: item.checksums,
        }),
      );

      return {
        objects,
        truncated: Boolean(payload.result_info?.is_truncated),
        cursor: payload.result_info?.cursor,
      };
    },

    /** Uploads an object and its HTTP metadata to R2. */
    async put(key, value, options) {
      const body =
        value instanceof ArrayBuffer
          ? value
          : value instanceof Uint8Array
            ? value
            : value;

      const response = await r2ApiFetch({
        accountId,
        bucketName,
        objectKey: key,
        method: "PUT",
        body: body as BodyInit,
        contentType: options?.httpMetadata?.contentType,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `R2 put failed for ${key} (${response.status}): ${text}`,
        );
      }

      const head = await _bucket.head(key);
      return (
        head ?? {
          key,
          httpMetadata: options?.httpMetadata,
        }
      );
    },

    /** Downloads an object and exposes its body as an ArrayBuffer. */
    async get(key) {
      const response = await r2ApiFetch({
        accountId,
        bucketName,
        objectKey: key,
        method: "GET",
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`R2 get failed for ${key} (${response.status})`);
      }

      return {
        /** Reads the downloaded response body as an ArrayBuffer. */
        async arrayBuffer() {
          return response.arrayBuffer();
        },
      };
    },

    /** Deletes an object from the remote R2 bucket. */
    async delete(key) {
      const response = await r2ApiFetch({
        accountId,
        bucketName,
        objectKey: key,
        method: "DELETE",
      });

      if (response.status === 404) {
        return;
      }

      if (!response.ok) {
        throw new Error(`R2 delete failed for ${key} (${response.status})`);
      }
    },
  };

  return _bucket;
}
