import fullWidthLayout from "../../storage/dsl/layouts/full-width.json";
import leftSidebarLayout from "../../storage/dsl/layouts/left-sidebar.json";
import rightSidebarLayout from "../../storage/dsl/layouts/right-sidebar.json";
import twoSidebarLayout from "../../storage/dsl/layouts/two-sidebar.json";
import homePage from "../../storage/dsl/pages/index/v1782151641308.json";
import type { ActorRef } from "../auth/types";
import { validateLayoutDSL, validatePageDSL } from "../schemas/nodes";
import type { AriaCollection, AriaEntryRecord } from "../cms/schemas";
import type { LayoutDSL, PageDSL } from "../types/nodes";
import type { StorageAdapter } from "./adapter";
import {
  AUTHORS_COLLECTION_NAME,
  BLOG_COLLECTION_NAME,
  TAGS_COLLECTION_NAME,
  buildAriaCollection,
  buildBlogEntryTemplatePage,
  buildBlogListPage,
  buildNotFoundPage,
  buildStarterCollectionDefinitions,
  buildStarterDesignSystem,
  buildStarterSiteSettings,
  buildTagArchiveTemplatePage,
  type StarterCollectionDefinition,
} from "./starterContent";
import { buildStarterCmsEntryRecords } from "./starterCmsEntries";
import {
  MAIN_NAV_COLLECTION_NAME,
  buildStarterMainNavCollectionDefinition,
} from "./starterMainNav";
import { allocateVersionId } from "./versioning";

type StarterDemoStep = "site-shell" | "collections" | "pages" | "catalog";

function parseLayout(input: unknown): LayoutDSL {
  const result = validateLayoutDSL(input);
  if (!result.success) {
    throw new Error(`Invalid bundled starter layout: ${result.error.message}`);
  }
  return result.data as LayoutDSL;
}

function parsePage(input: unknown): PageDSL {
  const result = validatePageDSL(input);
  if (!result.success) {
    throw new Error(`Invalid bundled starter page: ${result.error.message}`);
  }
  return result.data as PageDSL;
}

const STARTER_LAYOUTS = [
  fullWidthLayout,
  leftSidebarLayout,
  rightSidebarLayout,
  twoSidebarLayout,
].map(parseLayout);

const STARTER_HOME_PAGE = {
  ...parsePage(homePage),
  status: "published" as const,
};

const STARTER_DEMO_PAGES: Array<{
  page: PageDSL;
  systemRole: "standard" | "not-found" | "cms-collection" | "cms-entry";
}> = [
  { page: buildBlogListPage(), systemRole: "cms-collection" },
  { page: buildBlogEntryTemplatePage(), systemRole: "cms-entry" },
  { page: buildTagArchiveTemplatePage(), systemRole: "cms-entry" },
];

async function ensurePage(
  adapter: StorageAdapter,
  actor: ActorRef,
  page: PageDSL,
  systemRole: "standard" | "not-found" | "cms-collection" | "cms-entry",
): Promise<void> {
  if (!(await adapter.getPageDSL(page.id))) {
    // Stamp a single allocated version into both the DSL body and meta pins so
    // compose/save never see a bundled snapshot version diverge from the pin.
    const version = allocateVersionId();
    await adapter.savePageDSL(
      page.id,
      { ...page, version },
      {
        preserveVersion: true,
        versionHint: version,
      },
      {
        actor,
        mutationKind: "seed",
      },
    );
  }

  if (systemRole === "standard") return;
  const policy = await adapter.getPagePolicy(page.id);
  if (!policy || policy.systemRole === systemRole) return;
  await adapter.savePagePolicy({
    idOrSlug: policy.id,
    systemRole,
    accessMode: "public",
    accessPasswordHash: null,
    accessPromptTitle: null,
    accessPromptDescription: null,
    accessRememberForDays: null,
    accessPolicyVersion: policy.accessPolicyVersion + 1,
  });
}

async function ensureCollection(
  adapter: StorageAdapter,
  definition: StarterCollectionDefinition,
  now: string,
): Promise<AriaCollection> {
  const existing = await adapter.getCollection(definition.name);
  if (existing) return existing;
  return adapter.saveCollection(buildAriaCollection(definition, now));
}

async function ensureStarterCollections(
  adapter: StorageAdapter,
): Promise<Map<string, AriaCollection>> {
  const now = new Date().toISOString();
  const base = buildStarterCollectionDefinitions({ collectionIdByName: {} });
  const tags = await ensureCollection(adapter, base.tags, now);
  const authors = await ensureCollection(adapter, base.authors, now);
  const blogDefinition = buildStarterCollectionDefinitions({
    collectionIdByName: {
      [TAGS_COLLECTION_NAME]: tags.id,
      [AUTHORS_COLLECTION_NAME]: authors.id,
    },
  }).blog;
  const blog = await ensureCollection(adapter, blogDefinition, now);
  const mainNav = await ensureCollection(
    adapter,
    buildStarterMainNavCollectionDefinition(),
    now,
  );
  return new Map([
    [TAGS_COLLECTION_NAME, tags],
    [AUTHORS_COLLECTION_NAME, authors],
    [BLOG_COLLECTION_NAME, blog],
    [MAIN_NAV_COLLECTION_NAME, mainNav],
  ]);
}

async function applySiteShell(adapter: StorageAdapter, actor: ActorRef): Promise<void> {
  for (const layout of STARTER_LAYOUTS) {
    if (await adapter.getLayoutDSL(layout.id)) continue;
    await adapter.saveLayoutDSL(layout.id, layout, undefined, {
      actor,
      mutationKind: "seed",
    });
  }

  if (!(await adapter.getDesignSystem())) {
    await adapter.saveDesignSystem(buildStarterDesignSystem(), {
      actor,
      mutationKind: "seed",
    });
  }

  await ensurePage(adapter, actor, STARTER_HOME_PAGE, "standard");
  await ensurePage(adapter, actor, buildNotFoundPage(), "not-found");

  const settings = await adapter.getSiteSettings();
  const starter = buildStarterSiteSettings();
  await adapter.saveSiteSettings(
    {
      ...starter,
      ...(settings ?? {}),
      utilityEngine: settings?.utilityEngine ?? starter.utilityEngine,
      icons: settings?.icons ?? starter.icons,
      localization: settings?.localization ?? starter.localization,
      system: settings?.system ?? starter.system,
    },
    { actor, mutationKind: "seed" },
  );
}

async function applyPages(adapter: StorageAdapter, actor: ActorRef): Promise<void> {
  for (const { page, systemRole } of STARTER_DEMO_PAGES) {
    await ensurePage(adapter, actor, page, systemRole);
  }
}

function remapEntryRecord(
  record: AriaEntryRecord,
  collectionId: string,
  entryIdByCanonicalId: ReadonlyMap<string, string>,
): AriaEntryRecord {
  const frontmatter = record.locales[0]?.frontmatter ?? {};
  const author = frontmatter.author;
  const remappedFrontmatter =
    typeof author === "string" && entryIdByCanonicalId.has(author)
      ? { ...frontmatter, author: entryIdByCanonicalId.get(author) }
      : frontmatter;
  const entryId = entryIdByCanonicalId.get(record.entry.id) ?? record.entry.id;
  const relations = record.relations?.map((relation) => ({
    ...relation,
    sourceEntryId: entryId,
    targetEntryId:
      entryIdByCanonicalId.get(relation.targetEntryId) ?? relation.targetEntryId,
  }));

  return {
    ...record,
    entry: { ...record.entry, id: entryId, collectionId },
    locales: record.locales.map((locale) => ({
      ...locale,
      entryId,
      collectionId,
      frontmatter: remappedFrontmatter,
    })),
    relations,
  };
}

async function applyEntries(adapter: StorageAdapter): Promise<void> {
  const collections = await ensureStarterCollections(adapter);
  const records = buildStarterCmsEntryRecords(new Date().toISOString());
  const entryIdByCanonicalId = new Map<string, string>();
  const existingByCanonicalId = new Map<string, AriaEntryRecord>();

  for (const record of records) {
    const collection = collections.get(record.entry.collectionId);
    const locale = record.locales[0];
    if (!collection || !locale) {
      throw new Error(`Starter entry collection was not resolved: ${record.entry.collectionId}`);
    }
    const existing = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: locale.slug,
      locale: locale.locale,
      includeRelations: true,
    });
    entryIdByCanonicalId.set(record.entry.id, existing?.entry.id ?? record.entry.id);
    if (existing) existingByCanonicalId.set(record.entry.id, existing);
  }

  for (const record of records) {
    if (existingByCanonicalId.has(record.entry.id)) continue;
    const collection = collections.get(record.entry.collectionId);
    if (!collection) {
      throw new Error(`Starter entry collection was not resolved: ${record.entry.collectionId}`);
    }
    const remapped = remapEntryRecord(record, collection.id, entryIdByCanonicalId);
    await adapter.saveEntry(remapped, { relations: remapped.relations });
  }
}

export async function applyStarterDemoContentStep(
  adapter: StorageAdapter,
  step: StarterDemoStep,
  actor: ActorRef,
): Promise<void> {
  if (step === "site-shell") {
    await applySiteShell(adapter, actor);
    return;
  }
  if (step === "collections") {
    await ensureStarterCollections(adapter);
    return;
  }
  if (step === "pages") {
    await applyPages(adapter, actor);
    return;
  }
  await applyEntries(adapter);
}
