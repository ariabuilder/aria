import { actions } from "astro:actions";
import {
  AriaEntryRecordSchema,
  type AriaEntryRecord,
} from "../../../../lib/cms/schemas";
import {
  fetchCollection,
  fetchEntryList,
  getCachedCollection,
} from "../composables/useCmsDataCache";

function resolveSourceLocale(record: AriaEntryRecord) {
  return record.locales.find((locale) => locale.isSource) ?? record.locales[0] ?? null;
}

async function getTargetCollection(targetCollection: string) {
  const normalized = targetCollection.trim();
  const cached = getCachedCollection(normalized);
  if (cached) {
    return cached;
  }
  return fetchCollection(normalized);
}

export async function resolveTargetCollectionId(
  targetCollection: string,
): Promise<string> {
  const collection = await getTargetCollection(targetCollection);
  return collection.id;
}

export async function resolveCollectionDisplayName(
  targetCollection: string,
): Promise<string> {
  try {
    const collection = await getTargetCollection(targetCollection);
    return collection.label;
  } catch {
    return targetCollection.trim();
  }
}

export async function resolveEntryLabels(
  targetCollection: string,
  entryIds: readonly string[],
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(entryIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) {
    return {};
  }

  const collectionId = await resolveTargetCollectionId(targetCollection);
  const labels: Record<string, string> = {};

  try {
    const { items } = await fetchEntryList({
      collectionId,
      page: 1,
      limit: Math.max(100, uniqueIds.length),
    });
    for (const record of items) {
      const locale = resolveSourceLocale(record);
      if (locale) {
        labels[record.entry.id] = locale.title || locale.slug;
      }
    }
  } catch {
    // Fall through to per-entry lookups.
  }

  const unresolvedIds = uniqueIds.filter((id) => !labels[id]);
  if (unresolvedIds.length === 0) {
    return labels;
  }

  await Promise.all(
    unresolvedIds.map(async (id) => {
      try {
        const { data, error } = await actions.cms.entries.get({
          collectionId,
          idOrSlug: id,
        });
        if (error || !data) {
          return;
        }
        const record = AriaEntryRecordSchema.parse(data);
        const locale = resolveSourceLocale(record);
        if (locale) {
          labels[id] = locale.title || locale.slug;
        }
      } catch {
        // Keep UUID fallback labels if the lookup fails.
      }
    }),
  );

  return labels;
}
