const MAX_BASENAME_LENGTH = 48;

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function extractNameParts(input: string): { stem: string; extension: string } {
  const trimmed = input.trim();
  const leaf = trimmed.split(/[\\/]/).pop() ?? trimmed;
  const dotIndex = leaf.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === leaf.length - 1) {
    return { stem: leaf, extension: "" };
  }

  return {
    stem: leaf.slice(0, dotIndex),
    extension: leaf.slice(dotIndex + 1),
  };
}

function slugifyPart(value: string): string {
  const ascii = stripDiacritics(value).toLowerCase();
  const safe = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe;
}

export function createStoredMediaFilename(originalName: string): string {
  const { stem, extension } = extractNameParts(originalName);

  const normalizedStem = slugifyPart(stem);
  const normalizedExt = slugifyPart(extension).replace(/-/g, "");

  const base = (normalizedStem || "file").slice(0, MAX_BASENAME_LENGTH);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);

  return normalizedExt
    ? `${base}-${suffix}.${normalizedExt}`
    : `${base}-${suffix}`;
}
