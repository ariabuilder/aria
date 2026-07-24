export type EntryTranslationState =
  | "source"
  | "translated"
  | "missing"
  | "stale";

export interface EntryTranslationSource {
  title: string;
  slug: string;
  frontmatter: Record<string, unknown>;
  body: unknown;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function getEntryTranslationSourceHash(
  source: EntryTranslationSource,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    stableJson({
      title: source.title,
      slug: source.slug,
      frontmatter: source.frontmatter,
      body: source.body,
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
