import { z } from "astro/zod";
import type { StorageAdapter } from "../../storage/adapter";

const RebuildStageSchema = z.enum([
  "pages",
  "layouts",
  "components",
  "cms-entries",
  "page-locales",
  "layout-locales",
  "site-settings",
  "design-system",
]);

const CursorSchema = z.object({
  stage: RebuildStageSchema,
  index: z.int().nonnegative(),
  offset: z.int().nonnegative(),
});

const STAGES = RebuildStageSchema.options;

export type MediaUsageRebuildResult = {
  processed: number;
  scanned: number;
  inserted: number;
  unresolved: number;
  nextCursor: string | null;
  done: boolean;
};

function encodeCursor(cursor: z.infer<typeof CursorSchema>): string {
  return JSON.stringify(cursor);
}

function parseCursor(cursor?: string): z.infer<typeof CursorSchema> {
  if (!cursor) return { stage: "pages", index: 0, offset: 0 };
  try {
    return CursorSchema.parse(JSON.parse(cursor));
  } catch {
    throw new Error("Invalid media usage rebuild cursor.");
  }
}

function nextStage(stage: z.infer<typeof RebuildStageSchema>): string | null {
  const next = STAGES[STAGES.indexOf(stage) + 1];
  return next ? encodeCursor({ stage: next, index: 0, offset: 0 }) : null;
}

export async function rebuildMediaUsageBatch(
  adapter: StorageAdapter,
  input: { cursor?: string; limit?: number },
): Promise<MediaUsageRebuildResult> {
  const state = parseCursor(input.cursor);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const now = new Date().toISOString();
  let processed = 0;
  let scanned = 0;
  let inserted = 0;
  let unresolved = 0;

  const sync = async (
    kind: Parameters<StorageAdapter["syncMediaUsage"]>[0]["kind"],
    refId: string,
    resource: unknown,
  ) => {
    const result = await adapter.syncMediaUsage({
      kind,
      refId,
      resource,
      updatedAt: now,
    });
    processed += 1;
    scanned += result.scanned;
    inserted += result.inserted;
    unresolved += result.unresolved;
  };

  let nextCursor: string | null = null;

  if (state.stage === "pages") {
    const rows = await adapter.listPagesDSL({
      limit: limit + 1,
      offset: state.offset,
    });
    for (const row of rows.slice(0, limit)) {
      const [current, published] = await Promise.all([
        adapter.getPageDSL(row.id),
        adapter.getPublishedPageDSL(row.id),
      ]);
      await sync("page", row.id, { current: current ?? row, published });
    }
    nextCursor =
      rows.length > limit
        ? encodeCursor({ ...state, offset: state.offset + limit })
        : nextStage(state.stage);
  } else if (state.stage === "layouts") {
    const rows = await adapter.listLayoutsDSL({
      limit: limit + 1,
      offset: state.offset,
    });
    for (const row of rows.slice(0, limit)) await sync("layout", row.id, row);
    nextCursor =
      rows.length > limit
        ? encodeCursor({ ...state, offset: state.offset + limit })
        : nextStage(state.stage);
  } else if (state.stage === "components") {
    const rows = await adapter.listComponentsDSL({
      limit: limit + 1,
      offset: state.offset,
    });
    for (const row of rows.slice(0, limit))
      await sync("component", row.id, row);
    nextCursor =
      rows.length > limit
        ? encodeCursor({ ...state, offset: state.offset + limit })
        : nextStage(state.stage);
  } else if (state.stage === "cms-entries") {
    const collections = await adapter.listCollections();
    const collection = collections[state.index];
    if (!collection) {
      nextCursor = nextStage(state.stage);
    } else {
      const page = Math.floor(state.offset / limit) + 1;
      const result = await adapter.listEntries({
        collectionId: collection.id,
        page,
        limit,
      });
      for (const entry of result.items) {
        const completeEntry = await adapter.getEntry({
          collectionId: collection.id,
          idOrSlug: entry.entry.id,
          includeAllLocales: true,
          includeRelations: true,
        });
        await sync("cms-entry", entry.entry.id, completeEntry ?? entry);
      }
      const nextOffset = state.offset + result.items.length;
      nextCursor =
        nextOffset < result.total
          ? encodeCursor({ ...state, offset: nextOffset })
          : encodeCursor({ ...state, index: state.index + 1, offset: 0 });
    }
  } else if (state.stage === "page-locales") {
    const rows = await adapter.listPageLocaleRecords({
      limit: limit + 1,
      offset: state.offset,
    });
    for (const row of rows.slice(0, limit)) {
      const active = row.versions.filter((version) =>
        [row.meta.currentVersion, row.meta.publishedVersion].includes(
          version.version,
        ),
      );
      await sync("page-locale", `${row.meta.pageId}:${row.meta.locale}`, {
        versions: active,
      });
    }
    nextCursor =
      rows.length > limit
        ? encodeCursor({ ...state, offset: state.offset + limit })
        : nextStage(state.stage);
  } else if (state.stage === "layout-locales") {
    const rows = await adapter.listLayoutLocaleRecords({
      limit: limit + 1,
      offset: state.offset,
    });
    for (const row of rows.slice(0, limit)) {
      const active = row.versions.filter((version) =>
        [row.meta.currentVersion, row.meta.publishedVersion].includes(
          version.version,
        ),
      );
      await sync("layout-locale", `${row.meta.layoutId}:${row.meta.locale}`, {
        versions: active,
      });
    }
    nextCursor =
      rows.length > limit
        ? encodeCursor({ ...state, offset: state.offset + limit })
        : nextStage(state.stage);
  } else if (state.stage === "site-settings") {
    const settings = await adapter.getSiteSettings();
    await sync("site-settings", "site-settings", settings ?? {});
    nextCursor = nextStage(state.stage);
  } else {
    const designSystem = await adapter.getDesignSystem();
    await sync("design-system", "design-system", designSystem ?? {});
    await adapter.pruneOrphanedMediaUsage();
    nextCursor = null;
  }

  return {
    processed,
    scanned,
    inserted,
    unresolved,
    nextCursor,
    done: nextCursor === null,
  };
}
