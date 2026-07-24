import type { JsonObject } from "../../../../../lib/types/nodes";

function readMasterId(data: JsonObject): string | undefined {
  const reference = data.reference;
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    return undefined;
  }

  const masterId = reference.masterId;
  return typeof masterId === "string" && masterId.trim().length > 0
    ? masterId.trim()
    : undefined;
}

export function isEmptyLibraryComponentPayload(
  type: string,
  data: JsonObject,
  componentSlug?: string,
): boolean {
  const normalizedType = type.trim().toLowerCase();
  const dataType =
    typeof data.type === "string" ? data.type.trim().toLowerCase() : "";

  const isComponent =
    normalizedType === "component" || dataType === "component";

  if (!isComponent) {
    return false;
  }

  return !componentSlug && !readMasterId(data);
}
