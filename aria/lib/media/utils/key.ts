const INVALID_KEY = /[\u0000-\u001f\u007f]/;

export function normalizeMediaKey(input: string): string {
  const trimmed = input.trim();
  const noLeadingSlash = trimmed.replace(/^\/+/, "");
  const normalizedSeparators = noLeadingSlash.replace(/\\+/g, "/");
  const collapsed = normalizedSeparators.replace(/\/+/g, "/");

  if (!collapsed || collapsed === ".") {
    throw new Error("Invalid media key: empty path");
  }

  if (collapsed.includes("..") || collapsed.startsWith("/")) {
    throw new Error("Invalid media key: path traversal is not allowed");
  }

  if (INVALID_KEY.test(collapsed)) {
    throw new Error("Invalid media key: control characters are not allowed");
  }

  if (collapsed.length > 1024) {
    throw new Error("Invalid media key: path too long");
  }

  return collapsed;
}
