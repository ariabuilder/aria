import { logicalPathToObjectKey } from "./path";
import { isHiddenMediaPath } from "./visibility";

export function validateSafeMediaFilename(rawName: string): string {
  const filename = rawName.trim();

  if (!filename) {
    throw new Error("Filename is required");
  }

  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("Filename must not contain path separators");
  }

  if (filename === "." || filename === "..") {
    throw new Error("Invalid filename");
  }

  if (isHiddenMediaPath(filename)) {
    throw new Error("Hidden filenames are not allowed");
  }

  return filename;
}

export function validateMediaObjectKey(rawPath: string): string {
  const key = logicalPathToObjectKey(rawPath);

  if (!key || key.endsWith("/")) {
    throw new Error("Directory paths are not allowed for media operations");
  }

  const filename = key.split("/").filter(Boolean).pop();
  if (!filename || filename === "." || filename === "..") {
    throw new Error("Invalid media path");
  }

  if (isHiddenMediaPath(key)) {
    throw new Error("Hidden media paths are not allowed");
  }

  return key;
}
