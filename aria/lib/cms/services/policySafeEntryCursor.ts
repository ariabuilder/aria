import type { SessionUser } from "../../auth/types";
import type { StorageAdapter } from "../../storage/adapter";
import type { EntryStatus } from "../constants";
import { resolveSourceLocale } from "../entryProjection";
import type { AriaEntryRecord } from "../schemas";
import { evaluateCmsPolicy, projectCmsEntryRecord } from "./accessPolicy";
import {
  listEntriesFromAdapter,
  resolveEntryLocaleFromAdapter,
} from "./entries";

const STORAGE_PAGE_SIZE = 100;

export type PolicySafeEntryCursor = { page: number; index: number };

export type PolicySafeEntryPage = {
  items: AriaEntryRecord[];
  next: PolicySafeEntryCursor | null;
};

function matchesVisibleFilters(
  record: AriaEntryRecord,
  input: { status?: EntryStatus | EntryStatus[]; query?: string },
): boolean {
  if (input.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    if (!statuses.includes(record.entry.status)) return false;
  }
  const query = input.query?.trim().toLocaleLowerCase();
  if (!query) return true;
  return record.locales.some(
    (locale) =>
      locale.title.toLocaleLowerCase().includes(query) ||
      locale.slug.toLocaleLowerCase().includes(query),
  );
}

/**
 * Fills an outward-facing page only after collection policy projection. The
 * opaque cursor tracks raw storage position, so denied records.
 */
export async function listPolicySafeEntries(input: {
  adapter: StorageAdapter;
  actor: SessionUser;
  collectionId: string;
  locale?: string;
  status?: EntryStatus | EntryStatus[];
  query?: string;
  pageSize: number;
  cursor?: PolicySafeEntryCursor;
}): Promise<PolicySafeEntryPage> {
  const items: AriaEntryRecord[] = [];
  let page = input.cursor?.page ?? 1;
  let index = input.cursor?.index ?? 0;

  while (items.length < input.pageSize) {
    const raw = await listEntriesFromAdapter(input.adapter, {
      collectionId: input.collectionId,
      locale: input.locale,
      page,
      limit: STORAGE_PAGE_SIZE,
    });
    for (; index < raw.items.length; index += 1) {
      const record = raw.items[index]!;
      const resolved = await resolveEntryLocaleFromAdapter(
        input.adapter,
        record,
        input.locale,
      );
      const locale =
        resolved?.resolvedLocale ?? resolveSourceLocale(record)?.locale ?? "en";
      const decision = await evaluateCmsPolicy(input.adapter, {
        actor: input.actor,
        collectionId: input.collectionId,
        action: "read",
        locale,
        entry: record,
      });
      const projected = projectCmsEntryRecord(record, decision);
      if (!projected || !matchesVisibleFilters(projected, input)) continue;
      items.push(projected);
      if (items.length === input.pageSize) {
        const nextIndex = index + 1;
        const hasMoreInPage = nextIndex < raw.items.length;
        const hasMorePages = page * STORAGE_PAGE_SIZE < raw.total;
        return {
          items,
          next: hasMoreInPage
            ? { page, index: nextIndex }
            : hasMorePages
              ? { page: page + 1, index: 0 }
              : null,
        };
      }
    }
    if (page * STORAGE_PAGE_SIZE >= raw.total || raw.items.length === 0) break;
    page += 1;
    index = 0;
  }
  return { items, next: null };
}
