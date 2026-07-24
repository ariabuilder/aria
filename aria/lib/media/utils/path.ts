import { matchesUnsplashPhotoPath } from "./externalMediaUrl";
import { normalizeMediaKey } from "./key";

const UPLOADS_PREFIX = "/uploads/";
const SOURCE_ROUTE_PREFIX = "/media/source/";

function logicalPathFromSourceRoute(value: string): string | null {
  let pathname: string;
  try {
    pathname = toPathCandidate(value).replace(/[?#].*$/, "");
  } catch {
    return null;
  }
  if (!pathname.startsWith(SOURCE_ROUTE_PREFIX)) return null;

  const [version, ...segments] = pathname
    .slice(SOURCE_ROUTE_PREFIX.length)
    .split("/")
    .filter(Boolean);
  if (
    (!/^[1-9]\d*$/u.test(version ?? "") && version !== "current") ||
    segments.length === 0
  ) {
    return null;
  }

  try {
    return `${UPLOADS_PREFIX}${segments.map(decodeURIComponent).join("/")}`;
  } catch {
    return null;
  }
}

export function isAriaLibraryMediaPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return (
    trimmed.startsWith(UPLOADS_PREFIX) ||
    trimmed.startsWith("uploads/") ||
    trimmed.includes("/uploads/") ||
    logicalPathFromSourceRoute(trimmed) !== null
  );
}

export function isUrlReferencedMediaPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (isAriaLibraryMediaPath(trimmed)) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    return true;
  }

  if (matchesUnsplashPhotoPath(trimmed)) {
    return true;
  }

  if (trimmed.startsWith("/")) {
    return true;
  }

  return false;
}

function toPathCandidate(input: string): string {
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return parsed.pathname;
  }

  return trimmed;
}

export function normalizeLogicalMediaPath(input: string): string {
  const sourceLogicalPath = logicalPathFromSourceRoute(input);
  const candidate = (sourceLogicalPath ?? toPathCandidate(input))
    .replace(/[?#].*$/, "")
    .replace(/\\+/g, "/")
    .trim();

  if (!candidate) {
    throw new Error("Invalid media path: empty value");
  }

  const withoutUploadsPrefix = candidate.startsWith(UPLOADS_PREFIX)
    ? candidate.slice(UPLOADS_PREFIX.length)
    : candidate.startsWith("uploads/")
      ? candidate.slice("uploads/".length)
      : candidate.startsWith("/")
        ? candidate.slice(1)
        : candidate;

  const normalizedKey = normalizeMediaKey(withoutUploadsPrefix);
  return `${UPLOADS_PREFIX}${normalizedKey}`;
}

export function logicalPathToObjectKey(logicalPath: string): string {
  const normalizedPath = normalizeLogicalMediaPath(logicalPath);
  return normalizeMediaKey(normalizedPath.slice(UPLOADS_PREFIX.length));
}

export function resolveCollectedLogicalPath(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (isAriaLibraryMediaPath(trimmed)) {
    return normalizeLogicalMediaPath(trimmed);
  }
  if (isUrlReferencedMediaPath(trimmed)) {
    return trimmed;
  }
  return normalizeLogicalMediaPath(trimmed);
}
