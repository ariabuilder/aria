function isSiteExportMediaPath(normalized: string): boolean {
  return normalized === "_exports" || normalized.startsWith("_exports/");
}

function isImportSourceMediaPath(normalized: string): boolean {
  return normalized === "_imports" || normalized.startsWith("_imports/");
}

function isInternalMediaPath(normalized: string): boolean {
  return normalized === "_aria-media" || normalized.startsWith("_aria-media/");
}

export function isHiddenMediaPath(input: string): boolean {
  const normalized = input.replace(/\\+/g, "/").trim();

  if (!normalized) {
    return false;
  }

  if (isSiteExportMediaPath(normalized)) {
    return true;
  }

  return normalized
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.startsWith("."));
}

export function isListableMediaPath(input: string): boolean {
  const normalized = input.replace(/\\+/g, "/").trim();

  if (!normalized || normalized.endsWith("/")) {
    return false;
  }

  if (normalized.startsWith("thumbnails/")) {
    return false;
  }

  if (normalized.startsWith("user-avatars/")) {
    return false;
  }

  if (isSiteExportMediaPath(normalized)) {
    return false;
  }

  if (isImportSourceMediaPath(normalized)) {
    return false;
  }

  if (isInternalMediaPath(normalized)) {
    return false;
  }

  const segments = normalized.split("/").filter(Boolean);
  const filename = segments[segments.length - 1];

  if (!filename || filename.endsWith(".meta.json")) {
    return false;
  }

  return !segments.some((segment) => segment.startsWith("."));
}
