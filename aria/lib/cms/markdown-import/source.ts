import JSZip from "jszip";
import { CmsServiceError } from "../errors";
import {
  MarkdownImportSourceSchema,
  type MarkdownImportSource,
} from "./schemas";

const MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_FILES = 250;
const MAX_SOURCE_FILE_BYTES = 1_000_000;

function normalizedPath(path: string): string | null {
  const value = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !value ||
    value.startsWith("/") ||
    value.split("/").some((part) => part === ".." || part.length === 0)
  ) {
    return null;
  }
  return value;
}

function isMarkdownPath(path: string): boolean {
  return /\.mdx?$/i.test(path);
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `Source file is not valid UTF-8: ${path}`,
    );
  }
}

function assertUploadSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_COMPRESSED_BYTES) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Markdown import source exceeds the 20 MB upload limit.",
    );
  }
}

export async function extractMarkdownImportSources(input: {
  filename: string;
  bytes: Uint8Array;
}): Promise<MarkdownImportSource[]> {
  assertUploadSize(input.bytes);
  const filename = normalizedPath(input.filename);
  if (!filename) {
    throw new CmsServiceError("VALIDATION_ERROR", "Import filename is invalid.");
  }

  if (isMarkdownPath(filename)) {
    if (input.bytes.byteLength > MAX_SOURCE_FILE_BYTES) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "Markdown files must be 1 MB or smaller.",
      );
    }
    return [
      MarkdownImportSourceSchema.parse({
        path: filename,
        content: decodeUtf8(input.bytes, filename),
      }),
    ];
  }

  if (!/\.zip$/i.test(filename)) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Upload a Markdown file (.md or .mdx) or a ZIP archive.",
    );
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(input.bytes, { checkCRC32: true });
  } catch {
    throw new CmsServiceError("VALIDATION_ERROR", "ZIP archive could not be read.");
  }

  const files = Object.values(archive.files).filter((entry) => !entry.dir);
  if (files.length > MAX_SOURCE_FILES) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `ZIP archives may contain at most ${MAX_SOURCE_FILES} files.`,
    );
  }

  const sources: MarkdownImportSource[] = [];
  let totalBytes = 0;
  for (const entry of files) {
    const path = normalizedPath(entry.unsafeOriginalName ?? entry.name);
    if (!path) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "ZIP archive contains an unsafe file path.",
      );
    }
    if (!isMarkdownPath(path)) continue;

    const bytes = await entry.async("uint8array");
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_SOURCE_FILE_BYTES || totalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "Markdown archive exceeds the uncompressed content limit.",
      );
    }
    sources.push(
      MarkdownImportSourceSchema.parse({
        path,
        content: decodeUtf8(bytes, path),
      }),
    );
  }

  if (sources.length === 0) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "ZIP archive does not contain any .md or .mdx files.",
    );
  }
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}
