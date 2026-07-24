import { getAdapter } from "../../../../../../actions/_shared";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import { getSiteSettingsUtilityEngine } from "../../../../../../lib/storage/adapter";
import { normalizeSiteTimeZone } from "../../../../../../lib/datetime/timeZone";
import {
  AriaGetSiteContextInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionForTool } from "../invokeActionForTool";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { SiteContextOutputSchema } from "./schemas";

type MaybeRecord = Record<string, unknown>;

type ContextWarning = { section: string; message: string };

function resolveContextSection<T>(
  section: string,
  result: PromiseSettledResult<T>,
  fallback: T,
  warnings: ContextWarning[],
): { data: T; complete: boolean } {
  if (result.status === "fulfilled") {
    return { data: result.value, complete: true };
  }

  warnings.push({
    section,
    message:
      result.reason instanceof Error
        ? result.reason.message
        : `Unable to read ${section}`,
  });
  return { data: fallback, complete: false };
}

export async function ariaGetSiteContext(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionForTool({
    context,
    operationId: "agent.readSite",
    inputSchema: AriaGetSiteContextInputSchema,
    outputSchema: SiteContextOutputSchema,
    input,
    call: async () => {
      const adapter = await getAdapter(toToolActionContext(context));
      const siteSettings = await adapter.getSiteSettings();
      const warnings: ContextWarning[] = [];
      const [pagesResult, layoutsResult, componentsResult, collectionsResult] =
        await Promise.allSettled([
          adapter.listPagesDSL(),
          adapter.listLayoutsDSL(),
          adapter.listComponentsDSL(),
          adapter.listCollections(),
        ]);
      const pagesSection = resolveContextSection(
        "pages",
        pagesResult,
        [],
        warnings,
      );
      const layoutsSection = resolveContextSection(
        "layouts",
        layoutsResult,
        [],
        warnings,
      );
      const componentsSection = resolveContextSection(
        "components",
        componentsResult,
        [],
        warnings,
      );
      const collectionsSection = resolveContextSection(
        "cmsCollections",
        collectionsResult,
        [],
        warnings,
      );
      const pages = pagesSection.data;
      const layouts = layoutsSection.data;
      const components = componentsSection.data;
      const collections = collectionsSection.data;

      const collectionIds = collections.map((collection) => collection.id);
      const [entryCountsResult, mediaResult, redirectsResult] =
        await Promise.allSettled([
          collectionIds.length
            ? adapter.countEntriesByCollection(collectionIds)
            : Promise.resolve<Record<string, number>>({}),
          adapter.listMedia(),
          adapter.listRedirects({ includeDisabled: true }),
        ]);
      const entryCountsSection = resolveContextSection(
        "cmsEntryCounts",
        entryCountsResult,
        {},
        warnings,
      );
      const mediaSection = resolveContextSection(
        "media",
        mediaResult,
        [],
        warnings,
      );
      const redirectsSection = resolveContextSection(
        "redirects",
        redirectsResult,
        [],
        warnings,
      );
      const entryCounts = entryCountsSection.data;
      const media = mediaSection.data;
      const redirects = redirectsSection.data;

      const discovery = asRecord(siteSettings?.discovery);
      const analytics = asRecord(siteSettings?.analytics);
      const utilityEngine = getSiteSettingsUtilityEngine(siteSettings);

      return {
        site: {
          name: siteSettings?.siteName,
          url: siteSettings?.siteUrl,
          description: siteSettings?.siteDescription,
          timeZone: normalizeSiteTimeZone(siteSettings?.timeZone),
        },
        styling: {
          utilityEngine,
          utilityClassesAllowed: utilityEngine === "unocss",
        },
        counts: {
          pages: pages.length,
          layouts: layouts.length,
          components: components.length,
          media: media.length,
          redirects: redirects.length,
          cmsCollections: collections.length,
        },
        discovery: {
          discourageSearchEngines: discovery.discourageSearchEngines,
          robotsMode: discovery.robotsMode,
          sitemapMode: discovery.sitemapMode,
          llmsMode: discovery.llmsMode,
          aiBotPolicy: discovery.aiBotPolicy,
          includeSitemapInRobots: discovery.includeSitemapInRobots,
        },
        analytics: {
          activeProviders: Array.isArray(analytics.activeProviders)
            ? analytics.activeProviders
            : [],
          studioDisplay: analytics.studioDisplay,
        },
        cms: {
          collections: collections.slice(0, 20).map((collection) => ({
            id: collection.id,
            name: collection.name,
            label: collection.label,
            kind: collection.kind,
            scope: collection.scope,
            supports: collection.supports,
            fieldCount: collection.schema.fields.length,
            fieldTypes: Array.from(
              new Set(collection.schema.fields.map((field) => field.type)),
            ),
            entryCount: entryCounts[collection.id] ?? 0,
            urlPattern: collection.urlPattern,
            templatePageId: collection.templatePageId,
            listPageId: collection.listPageId,
            showInSidebar: collection.schema.navigation?.showInSidebar ?? true,
          })),
        },
        media: {
          recent: [...media]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 8)
            .map((asset) => ({
              path: asset.path,
              url: asset.url,
              contentType: asset.contentType,
              size: asset.size,
              createdAt: asset.createdAt,
            })),
        },
        redirects: {
          enabledCount: redirects.filter(
            (redirect) => redirect.enabled !== false,
          ).length,
          recent: redirects.slice(0, 8).map((redirect) => ({
            path: redirect.fromPath,
            target: redirect.toPath,
            status: redirect.statusCode,
            enabled: redirect.enabled,
            updatedAt: redirect.updatedAt,
          })),
        },
        capabilities: {
          editPages: context.user
            ? hasEffectiveCapability(context.user, "editPages")
            : false,
          editPageContent: context.user
            ? hasEffectiveCapability(context.user, "editPageContent")
            : false,
          editSiteSettings: context.user
            ? hasEffectiveCapability(context.user, "editSiteSettings")
            : false,
          publishContent: context.user
            ? hasEffectiveCapability(context.user, "publishContent")
            : false,
        },
        completeness: {
          siteSettings: true,
          pages: pagesSection.complete,
          layouts: layoutsSection.complete,
          components: componentsSection.complete,
          cmsCollections: collectionsSection.complete,
          cmsEntryCounts: entryCountsSection.complete,
          media: mediaSection.complete,
          redirects: redirectsSection.complete,
        },
        warnings,
      };
    },
  });
}

function asRecord(value: unknown): MaybeRecord {
  return value && typeof value === "object" ? (value as MaybeRecord) : {};
}
