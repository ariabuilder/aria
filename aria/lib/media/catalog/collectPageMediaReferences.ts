import type { ComponentDSL, PageDSL } from "../../types/nodes";
import { collectComponentReferenceIds } from "../../blocks/nodeUtils";
import { collectMediaReferencesFromResource } from "./collectMediaReferences";
import type { CollectedMediaReference } from "../../schemas/pageMedia";

const COMPONENT_FETCH_CONCURRENCY = 8;
const MAX_REFERENCES = 200;

function dedupeKey(ref: CollectedMediaReference): string {
  return `${ref.rawUrl}\0${ref.logicalPath}`;
}

function mergeReferences(
  target: Map<string, CollectedMediaReference>,
  refs: CollectedMediaReference[],
): void {
  for (const ref of refs) {
    const key = dedupeKey(ref);
    const existing = target.get(key);
    if (!existing) {
      target.set(key, ref);
      continue;
    }
    if (existing.refPath !== ref.refPath) {
      target.set(key, {
        ...existing,
        refPath: `${existing.refPath}; ${ref.refPath}`,
      });
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }
      results[currentIndex] = await mapper(item);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export type CollectPageMediaReferencesResult = {
  references: CollectedMediaReference[];
  missingComponents: Array<{ id: string }>;
  truncated: boolean;
};

export async function collectPageMediaReferences(
  page: PageDSL,
  getComponentDSL: (id: string) => Promise<ComponentDSL | null>,
): Promise<CollectPageMediaReferencesResult> {
  const merged = new Map<string, CollectedMediaReference>();
  const missingComponents: Array<{ id: string }> = [];
  const visited = new Set<string>();

  mergeReferences(merged, collectMediaReferencesFromResource(page));

  const pending = [...collectComponentReferenceIds(page.nodes ?? [])];

  while (pending.length > 0) {
    const batch: string[] = [];
    while (pending.length > 0 && batch.length < COMPONENT_FETCH_CONCURRENCY) {
      const id = pending.pop();
      if (!id || visited.has(id)) {
        continue;
      }
      visited.add(id);
      batch.push(id);
    }

    if (batch.length === 0) {
      continue;
    }

    await mapWithConcurrency(batch, COMPONENT_FETCH_CONCURRENCY, async (id) => {
      const dsl = await getComponentDSL(id);
      if (!dsl) {
        missingComponents.push({ id });
        return;
      }

      mergeReferences(merged, collectMediaReferencesFromResource(dsl));
      for (const nestedId of collectComponentReferenceIds(dsl.nodes ?? [])) {
        if (!visited.has(nestedId)) {
          pending.push(nestedId);
        }
      }
    });
  }

  let references = Array.from(merged.values());
  let truncated = false;

  if (references.length > MAX_REFERENCES) {
    references = references.slice(0, MAX_REFERENCES);
    truncated = true;
  }

  return {
    references,
    missingComponents,
    truncated,
  };
}
