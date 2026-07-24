import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { LocaleCodeSchema } from "../lib/localization/contentLocale";
import {
  deriveLocalePublicationState,
  LayoutLocaleMetaSchema,
  LayoutLocaleVersionSchema,
  LocalizedSeoSchema,
  PageLocaleMetaSchema,
  PageLocaleVersionSchema,
} from "../lib/localization/siteTranslationSchemas";
import {
  deleteLayoutTranslation,
  deletePageTranslation,
  publishLayoutTranslation,
  publishPageTranslation,
  saveLayoutTranslation,
  savePageTranslation,
  SiteTranslationServiceError,
  unpublishLayoutTranslation,
  unpublishPageTranslation,
} from "../lib/localization/siteTranslations";
import {
  buildTranslationManifest,
  getLocalizedFieldValue,
  setLocalizedFieldValue,
  type LocalizableDsl,
} from "../lib/localization/translationManifest";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";

const ResourceIdSchema = z.string().trim().min(1).max(160);
const VersionIdSchema = z.string().trim().min(1).max(160);
const HashSchema = z.string().trim().min(16).max(256);
const NullableVersionSchema = VersionIdSchema.nullable().optional();

const PageDraftInputSchema = z
  .object({
    pageId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    sourceVersion: VersionIdSchema,
    expectedCurrentVersion: NullableVersionSchema,
    pathname: z.string().trim().min(1).max(2_048).nullable().optional(),
    slug: z.string().trim().min(1).max(255).nullable(),
    accessPromptTitle: z.string().max(300).nullable().optional(),
    accessPromptDescription: z.string().max(2_000).nullable().optional(),
    seo: LocalizedSeoSchema,
    dsl: z.record(z.string(), z.unknown()),
    translatedPaths: z.array(z.string().trim().min(1).max(512)).max(4_000),
    sourceManifestHash: HashSchema,
    sourceStructureHash: HashSchema,
    layoutId: ResourceIdSchema.nullable(),
    fallbackLayoutVersion: VersionIdSchema.nullable(),
    contentHash: HashSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.layoutId === null) !== (value.fallbackLayoutVersion === null)) {
      context.addIssue({
        code: "custom",
        message: "Localized layout fallback must include both id and version.",
      });
    }
  });

const LayoutDraftInputSchema = z
  .object({
    layoutId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    sourceVersion: VersionIdSchema,
    expectedCurrentVersion: NullableVersionSchema,
    dsl: z.record(z.string(), z.unknown()),
    translatedPaths: z.array(z.string().trim().min(1).max(512)).max(4_000),
    sourceManifestHash: HashSchema,
    sourceStructureHash: HashSchema,
    contentHash: HashSchema.nullable(),
  })
  .strict();

const PublishPageInputSchema = z
  .object({
    pageId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("publish"),
  })
  .strict();

const PublishLayoutInputSchema = z
  .object({
    layoutId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("publish"),
  })
  .strict();

const DeletePageInputSchema = z
  .object({
    pageId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("delete"),
  })
  .strict();
const DeleteLayoutInputSchema = z
  .object({
    layoutId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("delete"),
  })
  .strict();
const RebasePageInputSchema = z
  .object({
    pageId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("rebase"),
  })
  .strict();
const RebaseLayoutInputSchema = z
  .object({
    layoutId: ResourceIdSchema,
    locale: LocaleCodeSchema,
    expectedCurrentVersion: VersionIdSchema,
    confirmation: z.literal("rebase"),
  })
  .strict();

const GetPageInputSchema = z
  .object({ pageId: ResourceIdSchema, locale: LocaleCodeSchema })
  .strict();
const CreatePageDraftInputSchema = GetPageInputSchema.extend({
  pathname: z.string().trim().min(1).max(2_048).nullable().optional(),
  /** Drafts may start from an explicit canonical revision; publish rechecks it. */
  sourceVersion: VersionIdSchema.optional(),
}).strict();
const GetLayoutInputSchema = z
  .object({ layoutId: ResourceIdSchema, locale: LocaleCodeSchema })
  .strict();
const CreateLayoutDraftInputSchema = GetLayoutInputSchema.extend({
  /** Drafts may start from an explicit canonical revision; publish rechecks it. */
  sourceVersion: VersionIdSchema.optional(),
}).strict();
const UnpublishPageInputSchema = GetPageInputSchema.extend({
  confirmation: z.literal("unpublish"),
}).strict();
const UnpublishLayoutInputSchema = GetLayoutInputSchema.extend({
  confirmation: z.literal("unpublish"),
}).strict();

function versionId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure random UUID generation is unavailable.");
  return `locale-${id}`;
}

function actorSnapshot(actor: {
  id: string;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
}) {
  return {
    id: actor.id,
    username: actor.username ?? null,
    email: actor.email ?? null,
    avatarUrl: actor.avatarUrl ?? null,
  };
}

function throwActionError(error: unknown): never {
  if (error instanceof SiteTranslationServiceError) {
    const code =
      error.code === "SOURCE_NOT_FOUND" ||
      error.code === "TRANSLATION_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "VERSION_CONFLICT" ||
            error.code === "ROUTE_CONFLICT" ||
            error.code === "ROUTE_LOCKED" ||
            error.code === "TRANSLATION_OUTDATED"
          ? "CONFLICT"
          : "BAD_REQUEST";
    throw new ActionError({ code, message: error.message });
  }
  throw error;
}

export const localization = {
  pageMatrix: defineAction({
    accept: "json",
    input: z.object({ pageId: ResourceIdSchema }).strict(),
    handler: async (input, context) => {
      await requireOperation(context, "localization.getPage");
      const adapter = await getStorageAdapterAsync(context.locals);
      const policy = await adapter.getPagePolicy(input.pageId);
      const ownsRoute = !policy || policy.systemRole === "standard";
      const pins = await adapter.getPageVersionPins(input.pageId);
      const settings = await adapter.getSiteSettings();
      const localization = settings?.localization?.content;
      if (!localization) return [];
      return Promise.all(
        localization.locales.map(async (locale) => {
          const isDefault = locale.code === localization.defaultLocale;
          const meta = isDefault
            ? null
            : await adapter.getPageLocaleMeta(input.pageId, locale.code);
          const [current, published, route] = meta
            ? await Promise.all([
                adapter.getPageLocaleVersion(
                  input.pageId,
                  locale.code,
                  meta.currentVersion,
                ),
                meta.publishedVersion
                  ? adapter.getPageLocaleVersion(
                      input.pageId,
                      locale.code,
                      meta.publishedVersion,
                    )
                  : Promise.resolve(null),
                adapter.getPageLocaleRoute(input.pageId, locale.code),
              ])
            : [null, null, null];
          const state = deriveLocalePublicationState({
            enabled: locale.enabled,
            meta,
            currentSourceVersion: pins?.currentVersion ?? null,
            publishedSourceVersion: pins?.publishedVersion ?? null,
            currentTranslationSourceVersion: current?.sourceVersion ?? null,
            publishedTranslationSourceVersion: published?.sourceVersion ?? null,
            suppressedBy: [
              ...(meta?.publishedVersion && !pins?.publishedVersion
                ? ["canonical" as const]
                : []),
              ...(ownsRoute && meta?.publishedVersion && !route
                ? ["route" as const]
                : []),
            ],
          });
          return {
            locale: locale.code,
            label: locale.label,
            enabled: locale.enabled,
            isDefault,
            ownsRoute,
            direction: locale.direction,
            meta,
            state,
            publishReady: Boolean(
              meta &&
              locale.enabled &&
              pins?.publishedVersion &&
              current?.sourceVersion === pins.publishedVersion &&
              (!ownsRoute || route),
            ),
          };
        }),
      );
    },
  }),

  getPage: defineAction({
    accept: "json",
    input: GetPageInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "localization.getPage");
      const adapter = await getStorageAdapterAsync(context.locals);
      return adapter.getPageLocaleMeta(input.pageId, input.locale);
    },
  }),

  getPageTranslation: defineAction({
    accept: "json",
    input: GetPageInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "localization.getPage");
      const adapter = await getStorageAdapterAsync(context.locals);
      const meta = await adapter.getPageLocaleMeta(input.pageId, input.locale);
      if (!meta)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized page draft was not found.",
        });
      const version = await adapter.getPageLocaleVersion(
        input.pageId,
        input.locale,
        meta.currentVersion,
      );
      if (!version)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized page version was not found.",
        });
      const source = await adapter.getPageDSL(
        input.pageId,
        version.sourceVersion,
      );
      if (!source)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Canonical source page version was not found.",
        });
      return {
        meta: PageLocaleMetaSchema.parse(meta),
        version: PageLocaleVersionSchema.parse(version),
        route: await adapter.getPageLocaleRoute(input.pageId, input.locale),
        sourceDsl: source,
        manifest: buildTranslationManifest(source),
      };
    },
  }),

  getLayout: defineAction({
    accept: "json",
    input: GetLayoutInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "localization.getLayout");
      const adapter = await getStorageAdapterAsync(context.locals);
      return adapter.getLayoutLocaleMeta(input.layoutId, input.locale);
    },
  }),

  layoutMatrix: defineAction({
    accept: "json",
    input: z.object({ layoutId: ResourceIdSchema }).strict(),
    handler: async (input, context) => {
      await requireOperation(context, "localization.getLayout");
      const adapter = await getStorageAdapterAsync(context.locals);
      const localization = (await adapter.getSiteSettings())?.localization
        ?.content;
      const pins = await adapter.getLayoutVersionPins(input.layoutId);
      if (!localization) return [];
      return Promise.all(
        localization.locales.map(async (locale) => {
          const isDefault = locale.code === localization.defaultLocale;
          const meta = isDefault
            ? null
            : await adapter.getLayoutLocaleMeta(input.layoutId, locale.code);
          const [current, published] = meta
            ? await Promise.all([
                adapter.getLayoutLocaleVersion(
                  input.layoutId,
                  locale.code,
                  meta.currentVersion,
                ),
                meta.publishedVersion
                  ? adapter.getLayoutLocaleVersion(
                      input.layoutId,
                      locale.code,
                      meta.publishedVersion,
                    )
                  : Promise.resolve(null),
              ])
            : [null, null];
          const state = deriveLocalePublicationState({
            enabled: locale.enabled,
            meta,
            currentSourceVersion: pins?.currentVersion ?? null,
            publishedSourceVersion: pins?.currentVersion ?? null,
            currentTranslationSourceVersion: current?.sourceVersion ?? null,
            publishedTranslationSourceVersion: published?.sourceVersion ?? null,
          });
          return {
            locale: locale.code,
            label: locale.label,
            enabled: locale.enabled,
            isDefault,
            direction: locale.direction,
            meta,
            state,
            publishReady: Boolean(
              meta &&
              locale.enabled &&
              current?.sourceVersion === pins?.currentVersion,
            ),
          };
        }),
      );
    },
  }),

  getLayoutTranslation: defineAction({
    accept: "json",
    input: GetLayoutInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "localization.getLayout");
      const adapter = await getStorageAdapterAsync(context.locals);
      const meta = await adapter.getLayoutLocaleMeta(
        input.layoutId,
        input.locale,
      );
      if (!meta)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized layout draft was not found.",
        });
      const version = await adapter.getLayoutLocaleVersion(
        input.layoutId,
        input.locale,
        meta.currentVersion,
      );
      if (!version)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized layout version was not found.",
        });
      const source = await adapter.getLayoutDSL(
        input.layoutId,
        version.sourceVersion,
      );
      if (!source)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Canonical source layout version was not found.",
        });
      return {
        meta: LayoutLocaleMetaSchema.parse(meta),
        version: LayoutLocaleVersionSchema.parse(version),
        sourceDsl: source,
        manifest: buildTranslationManifest(source),
      };
    },
  }),

  createPageDraft: defineAction({
    accept: "json",
    input: CreatePageDraftInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.savePageDraft",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const policy = await adapter.getPagePolicy(input.pageId);
      const ownsRoute = !policy || policy.systemRole === "standard";
      const pins = await adapter.getPageVersionPins(input.pageId);
      const sourceVersion = input.sourceVersion ?? pins?.currentVersion;
      const source = sourceVersion
        ? await adapter.getPageDSL(input.pageId, sourceVersion)
        : null;
      if (!source || !sourceVersion) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Canonical page source was not found.",
        });
      }
      const sourceSeo = source.settings?.seo;
      const manifest = buildTranslationManifest(source);
      const layoutPins = source.layout
        ? await adapter.getLayoutVersionPins(source.layout)
        : null;
      try {
        const meta = await savePageTranslation(adapter, {
          expectedCurrentVersion: null,
          pathname: ownsRoute ? input.pathname : null,
          version: {
            pageId: input.pageId,
            locale: input.locale,
            version: versionId(),
            sourceVersion,
            slug: ownsRoute
              ? ((input.pathname ?? "").split("/").filter(Boolean).at(-1) ??
                null)
              : null,
            accessPromptTitle: null,
            accessPromptDescription: null,
            seo: {
              title: sourceSeo?.title ?? null,
              description: sourceSeo?.description ?? null,
              canonicalPath: null,
              noindex: sourceSeo?.noindex ?? false,
              nofollow: sourceSeo?.nofollow ?? false,
              ogTitle: sourceSeo?.ogTitle ?? null,
              ogDescription: sourceSeo?.ogDescription ?? null,
              ogImage: sourceSeo?.ogImage ?? null,
            },
            dsl: JSON.parse(JSON.stringify(source)) as Record<string, unknown>,
            translatedPaths: [],
            sourceManifestHash: manifest.hash,
            sourceStructureHash: manifest.structureHash,
            layoutId: source.layout ?? null,
            fallbackLayoutVersion: layoutPins?.currentVersion ?? null,
            contentHash: manifest.structureHash,
            createdAt: new Date().toISOString(),
            actor: actorSnapshot(authorship.actor),
          },
        });
        return PageLocaleMetaSchema.parse(meta);
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  createLayoutDraft: defineAction({
    accept: "json",
    input: CreateLayoutDraftInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.saveLayoutDraft",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const pins = await adapter.getLayoutVersionPins(input.layoutId);
      const sourceVersion = input.sourceVersion ?? pins?.currentVersion;
      const source = sourceVersion
        ? await adapter.getLayoutDSL(input.layoutId, sourceVersion)
        : null;
      if (!source || !sourceVersion)
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Canonical layout source was not found.",
        });
      const manifest = buildTranslationManifest(source);
      try {
        return LayoutLocaleMetaSchema.parse(
          await saveLayoutTranslation(adapter, {
            expectedCurrentVersion: null,
            version: {
              layoutId: input.layoutId,
              locale: input.locale,
              version: versionId(),
              sourceVersion,
              dsl: JSON.parse(JSON.stringify(source)) as Record<
                string,
                unknown
              >,
              translatedPaths: [],
              sourceManifestHash: manifest.hash,
              sourceStructureHash: manifest.structureHash,
              contentHash: manifest.structureHash,
              createdAt: new Date().toISOString(),
              actor: actorSnapshot(authorship.actor),
            },
          }),
        );
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  savePageDraft: defineAction({
    accept: "json",
    input: PageDraftInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.savePageDraft",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const meta = await savePageTranslation(adapter, {
          expectedCurrentVersion: input.expectedCurrentVersion ?? null,
          pathname: input.pathname ?? null,
          version: {
            pageId: input.pageId,
            locale: input.locale,
            version: versionId(),
            sourceVersion: input.sourceVersion,
            slug: input.slug,
            accessPromptTitle: input.accessPromptTitle ?? null,
            accessPromptDescription: input.accessPromptDescription ?? null,
            seo: input.seo,
            dsl: input.dsl,
            translatedPaths: input.translatedPaths,
            sourceManifestHash: input.sourceManifestHash,
            sourceStructureHash: input.sourceStructureHash,
            layoutId: input.layoutId,
            fallbackLayoutVersion: input.fallbackLayoutVersion,
            contentHash: input.contentHash,
            createdAt: new Date().toISOString(),
            actor: actorSnapshot(authorship.actor),
          },
        });
        return PageLocaleMetaSchema.parse(meta);
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  rebasePageDraft: defineAction({
    accept: "json",
    input: RebasePageInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.savePageDraft",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const current = await adapter.getPageLocaleVersion(
        input.pageId,
        input.locale,
        input.expectedCurrentVersion,
      );
      const pins = await adapter.getPageVersionPins(input.pageId);
      const policy = await adapter.getPagePolicy(input.pageId);
      const ownsRoute = !policy || policy.systemRole === "standard";
      const sourceVersion = pins?.currentVersion;
      const source = sourceVersion
        ? await adapter.getPageDSL(input.pageId, sourceVersion)
        : null;
      const route = await adapter.getPageLocaleRoute(
        input.pageId,
        input.locale,
      );
      if (!current || !source || !sourceVersion || (ownsRoute && !route)) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized page rebase source was not found.",
        });
      }
      const manifest = buildTranslationManifest(source);
      const rebasedDsl = JSON.parse(JSON.stringify(source)) as Record<
        string,
        unknown
      >;
      const validPaths = new Set(manifest.entries.map((entry) => entry.path));
      const translatedPaths: string[] = [];
      for (const path of current.translatedPaths) {
        if (!validPaths.has(path)) continue;
        const value = getLocalizedFieldValue(
          current.dsl as unknown as LocalizableDsl,
          path,
        );
        if (
          value !== null &&
          setLocalizedFieldValue(
            rebasedDsl as unknown as LocalizableDsl,
            path,
            value,
          )
        ) {
          translatedPaths.push(path);
        }
      }
      const layoutPins = source.layout
        ? await adapter.getLayoutVersionPins(source.layout)
        : null;
      try {
        const meta = await savePageTranslation(adapter, {
          expectedCurrentVersion: input.expectedCurrentVersion,
          pathname: route?.pathname ?? null,
          version: {
            pageId: input.pageId,
            locale: input.locale,
            version: versionId(),
            sourceVersion,
            slug: current.slug,
            accessPromptTitle: current.accessPromptTitle,
            accessPromptDescription: current.accessPromptDescription,
            seo: current.seo,
            dsl: rebasedDsl,
            translatedPaths,
            sourceManifestHash: manifest.hash,
            sourceStructureHash: manifest.structureHash,
            layoutId: source.layout ?? null,
            fallbackLayoutVersion: layoutPins?.currentVersion ?? null,
            contentHash: manifest.structureHash,
            createdAt: new Date().toISOString(),
            actor: actorSnapshot(authorship.actor),
          },
        });
        return {
          meta: PageLocaleMetaSchema.parse(meta),
          droppedPaths: current.translatedPaths.filter(
            (path) => !validPaths.has(path),
          ),
        };
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  publishPage: defineAction({
    accept: "json",
    input: PublishPageInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.publishPage",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        return PageLocaleMetaSchema.parse(
          await publishPageTranslation(adapter, input),
        );
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  unpublishPage: defineAction({
    accept: "json",
    input: UnpublishPageInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.unpublishPage",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const meta = await unpublishPageTranslation(adapter, input);
        return meta ? PageLocaleMetaSchema.parse(meta) : null;
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  deletePage: defineAction({
    accept: "json",
    input: DeletePageInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.unpublishPage",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await deletePageTranslation(adapter, input);
        return { deleted: true };
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  saveLayoutDraft: defineAction({
    accept: "json",
    input: LayoutDraftInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.saveLayoutDraft",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const meta = await saveLayoutTranslation(adapter, {
          expectedCurrentVersion: input.expectedCurrentVersion ?? null,
          version: {
            layoutId: input.layoutId,
            locale: input.locale,
            version: versionId(),
            sourceVersion: input.sourceVersion,
            dsl: input.dsl,
            translatedPaths: input.translatedPaths,
            sourceManifestHash: input.sourceManifestHash,
            sourceStructureHash: input.sourceStructureHash,
            contentHash: input.contentHash,
            createdAt: new Date().toISOString(),
            actor: actorSnapshot(authorship.actor),
          },
        });
        return LayoutLocaleMetaSchema.parse(meta);
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  rebaseLayoutDraft: defineAction({
    accept: "json",
    input: RebaseLayoutInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "localization.saveLayoutDraft",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const current = await adapter.getLayoutLocaleVersion(
        input.layoutId,
        input.locale,
        input.expectedCurrentVersion,
      );
      const pins = await adapter.getLayoutVersionPins(input.layoutId);
      const sourceVersion = pins?.currentVersion;
      const source = sourceVersion
        ? await adapter.getLayoutDSL(input.layoutId, sourceVersion)
        : null;
      if (!current || !source || !sourceVersion) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Localized layout rebase source was not found.",
        });
      }
      const manifest = buildTranslationManifest(source);
      const rebasedDsl = JSON.parse(JSON.stringify(source)) as Record<
        string,
        unknown
      >;
      const validPaths = new Set(manifest.entries.map((entry) => entry.path));
      const translatedPaths: string[] = [];
      for (const path of current.translatedPaths) {
        if (!validPaths.has(path)) continue;
        const value = getLocalizedFieldValue(
          current.dsl as unknown as LocalizableDsl,
          path,
        );
        if (
          value !== null &&
          setLocalizedFieldValue(
            rebasedDsl as unknown as LocalizableDsl,
            path,
            value,
          )
        ) {
          translatedPaths.push(path);
        }
      }
      try {
        const meta = await saveLayoutTranslation(adapter, {
          expectedCurrentVersion: input.expectedCurrentVersion,
          version: {
            layoutId: input.layoutId,
            locale: input.locale,
            version: versionId(),
            sourceVersion,
            dsl: rebasedDsl,
            translatedPaths,
            sourceManifestHash: manifest.hash,
            sourceStructureHash: manifest.structureHash,
            contentHash: manifest.structureHash,
            createdAt: new Date().toISOString(),
            actor: actorSnapshot(authorship.actor),
          },
        });
        return {
          meta: LayoutLocaleMetaSchema.parse(meta),
          droppedPaths: current.translatedPaths.filter(
            (path) => !validPaths.has(path),
          ),
        };
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  publishLayout: defineAction({
    accept: "json",
    input: PublishLayoutInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.publishLayout",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        return LayoutLocaleMetaSchema.parse(
          await publishLayoutTranslation(adapter, input),
        );
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  unpublishLayout: defineAction({
    accept: "json",
    input: UnpublishLayoutInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.unpublishLayout",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const meta = await unpublishLayoutTranslation(adapter, input);
        return meta ? LayoutLocaleMetaSchema.parse(meta) : null;
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),

  deleteLayout: defineAction({
    accept: "json",
    input: DeleteLayoutInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "localization.unpublishLayout",
        "save-layout",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await deleteLayoutTranslation(adapter, input);
        return { deleted: true };
      } catch (error) {
        return throwActionError(error);
      }
    },
  }),
};

export {
  GetLayoutInputSchema,
  GetPageInputSchema,
  LayoutDraftInputSchema,
  DeleteLayoutInputSchema,
  DeletePageInputSchema,
  PageDraftInputSchema,
  PublishLayoutInputSchema,
  PublishPageInputSchema,
  RebaseLayoutInputSchema,
  RebasePageInputSchema,
};
