import fs from "node:fs/promises";
import path from "node:path";
import { resolveUploadsR2ObjectKey } from "./serveUploadsFromR2";

const UPLOADS_CACHE_CONTROL =
  "private, max-age=3600, stale-while-revalidate=86400";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function inferContentType(objectKey: string): string {
  const extension = path.extname(objectKey).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function isSafeObjectKey(objectKey: string): boolean {
  if (!objectKey || objectKey.includes("..")) {
    return false;
  }

  const segments = objectKey.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== ".");
}

async function readContentTypeFromMetadata(
  filePath: string,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(`${filePath}.meta.json`, "utf-8");
    const parsed = JSON.parse(raw) as { contentType?: unknown };
    return typeof parsed.contentType === "string" && parsed.contentType.length > 0
      ? parsed.contentType
      : null;
  } catch {
    return null;
  }
}

export async function serveUploadsFromLocalFilesystem(input: {
  requestUrl: string;
  uploadRoot?: string;
}): Promise<Response | null> {
  const requestUrl = new URL(input.requestUrl);
  const objectKey = resolveUploadsR2ObjectKey(requestUrl.pathname);
  if (!objectKey || !isSafeObjectKey(objectKey)) {
    return null;
  }

  const uploadRoot = path.resolve(input.uploadRoot ?? "./public/uploads");
  const filePath = path.resolve(uploadRoot, objectKey);
  const uploadRootWithSep = `${uploadRoot}${path.sep}`;

  if (filePath !== uploadRoot && !filePath.startsWith(uploadRootWithSep)) {
    return null;
  }

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return null;
    }

    const body = await fs.readFile(filePath);
    const metadataContentType = await readContentTypeFromMetadata(filePath);
    const headers = new Headers({
      "Content-Type": metadataContentType ?? inferContentType(objectKey),
      "Cache-Control": UPLOADS_CACHE_CONTROL,
      "Last-Modified": stats.mtime.toUTCString(),
      ETag: `W/"${stats.size}-${stats.mtimeMs}"`,
    });

    return new Response(body, { status: 200, headers });
  } catch {
    return null;
  }
}
