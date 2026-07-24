const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "ico",
  "avif",
  "mp4",
  "webm",
  "mov",
  "avi",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
]);

function isAllowedMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();

  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("video/") ||
    normalized.includes("pdf") ||
    normalized.includes("document") ||
    normalized.includes("msword") ||
    normalized.includes("spreadsheet") ||
    normalized.includes("presentation") ||
    normalized.includes("zip") ||
    normalized.includes("archive")
  );
}

export function enforceMediaSyncPolicy(input: {
  logicalPath: string;
  mimeType?: string;
}): void {
  const filename = input.logicalPath.split("/").pop() ?? input.logicalPath;
  const extension = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase()
    : undefined;

  if (extension && ALLOWED_EXTENSIONS.has(extension)) {
    return;
  }

  if (input.mimeType && isAllowedMimeType(input.mimeType)) {
    return;
  }

  throw new Error(
    `Blocked by media policy: unsupported file type for \"${input.logicalPath}\"`,
  );
}
