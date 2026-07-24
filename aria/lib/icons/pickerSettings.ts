import { toCanonicalIconId } from "./reference";

export function resolveIconPickerPack(
  enabledPacks: readonly string[],
  preferredPack?: string | null,
): string {
  if (enabledPacks.length === 0) {
    return "";
  }

  if (preferredPack && enabledPacks.includes(preferredPack)) {
    return preferredPack;
  }

  return enabledPacks[0] ?? "";
}

export function inferIconPickerPackFromValue(
  value: string | undefined,
  enabledPacks: readonly string[],
): string | null {
  const canonicalId = toCanonicalIconId(value ?? "");
  if (!canonicalId) {
    return null;
  }

  const pack = canonicalId.split(":")[0] ?? "";
  return enabledPacks.includes(pack) ? pack : null;
}
