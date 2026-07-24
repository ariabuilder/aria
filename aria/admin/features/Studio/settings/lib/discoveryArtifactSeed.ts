export function resolveArtifactCustomSeed(
  existingCustom: string | undefined,
  generatedBaseline: string | null | undefined,
): string {
  const trimmed = existingCustom?.trim();
  if (trimmed) {
    return trimmed;
  }
  return generatedBaseline ?? "";
}
