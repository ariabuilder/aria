function splitFilename(filename: string): { baseName: string; extension: string } {
  const trimmed = filename.trim();
  const lastDotIndex = trimmed.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === trimmed.length - 1) {
    return {
      baseName: trimmed,
      extension: "",
    };
  }

  return {
    baseName: trimmed.slice(0, lastDotIndex),
    extension: trimmed.slice(lastDotIndex).toLowerCase(),
  };
}

export function sanitizeFontFilename(filename: string): string {
  const { baseName, extension } = splitFilename(filename);

  const sanitizedBase = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .trim();

  const fallbackBase = sanitizedBase || "font";
  return `${fallbackBase}${extension}`;
}

export async function resolveUniqueFontStoragePath(
  readFile: (path: string) => Promise<Buffer | null>,
  originalFilename: string,
): Promise<string> {
  const sanitizedFilename = sanitizeFontFilename(originalFilename);
  const { baseName, extension } = splitFilename(sanitizedFilename);

  let index = 0;
  while (index < 1000) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const nextPath = `fonts/${baseName}${suffix}${extension}`;
    const existing = await readFile(nextPath);
    if (!existing) {
      return nextPath;
    }
    index += 1;
  }

  throw new Error("Unable to resolve a unique filename for the uploaded font");
}
