import {
  CmsEntryDiffSchema,
  type AriaEntrySnapshot,
  type CmsEntryDiff,
} from "../schemas";

const MAX_VALUE_CHARS = 10_000;
const MAX_CHANGES = 200;

function stableValue(value: unknown): string {
  const canonicalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, canonicalize(nested)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(canonicalize(value));
}

function bounded(value: unknown): { value: unknown; truncated: boolean } {
  const serialized = typeof value === "string" ? value : stableValue(value);
  if (serialized.length <= MAX_VALUE_CHARS) return { value, truncated: false };
  return { value: `${serialized.slice(0, MAX_VALUE_CHARS)}…`, truncated: true };
}

function same(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

export function diffEntrySnapshots(input: {
  entryId: string;
  locale: string;
  left: AriaEntrySnapshot;
  right: AriaEntrySnapshot;
  visibleFields: ReadonlySet<string> | null;
}): CmsEntryDiff {
  const leftLocale = input.left.locales.find((item) => item.locale === input.locale);
  const rightLocale = input.right.locales.find((item) => item.locale === input.locale);
  const changes: CmsEntryDiff["changes"] = [];
  const add = (field: string, kind: CmsEntryDiff["changes"][number]["kind"], before: unknown, after: unknown) => {
    if (changes.length >= MAX_CHANGES || same(before, after)) return;
    const boundedBefore = bounded(before);
    const boundedAfter = bounded(after);
    changes.push({ field, kind, before: boundedBefore.value, after: boundedAfter.value, truncated: boundedBefore.truncated || boundedAfter.truncated });
  };
  for (const field of ["title", "slug", "body"] as const) {
    if (input.visibleFields && !input.visibleFields.has(field)) continue;
    add(field, field === "body" ? "body" : "scalar", leftLocale?.[field], rightLocale?.[field]);
  }
  const keys = new Set([
    ...Object.keys(leftLocale?.frontmatter ?? {}),
    ...Object.keys(rightLocale?.frontmatter ?? {}),
  ]);
  for (const key of keys) {
    if (input.visibleFields && !input.visibleFields.has(key)) continue;
    const before = leftLocale?.frontmatter[key];
    const after = rightLocale?.frontmatter[key];
    add(key, before === undefined || after === undefined ? "field_presence" : "scalar", before, after);
  }
  const relations = (snapshot: AriaEntrySnapshot) => snapshot.relations?.filter(
    (relation) => !input.visibleFields || input.visibleFields.has(relation.fieldKey),
  ) ?? [];
  add("relations", "relation", relations(input.left), relations(input.right));
  return CmsEntryDiffSchema.parse({
    entryId: input.entryId,
    locale: input.locale,
    changes,
    truncated: changes.length >= MAX_CHANGES || changes.some((change) => change.truncated),
  });
}
