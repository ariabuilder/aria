import { z } from "zod";
import {
  COLLECTION_KINDS,
  COLLECTION_SCOPES,
  COLLECTION_SUPPORTS,
  type CollectionSupport,
} from "../../../../lib/cms/constants";
import { suggestCollectionUrlPattern } from "../../../../lib/cms/routing";
import {
  AriaCollectionSchema,
  CollectionCommentsSettingsSchema,
  CollectionRssSettingsSchema,
  UpdateCollectionRequestSchema,
  type AriaCollection,
} from "../../../../lib/cms/schemas";

export const COLLECTION_SUPPORT_OPTIONS: readonly {
  value: CollectionSupport;
  label: string;
}[] = [
  { value: "body", label: "Body editor" },
  { value: "cover", label: "Cover image" },
  { value: "drafts", label: "Drafts" },
  { value: "revisions", label: "Revisions" },
  { value: "scheduling", label: "Scheduling" },
  { value: "search", label: "Search" },
  { value: "seo", label: "SEO" },
  { value: "rss", label: "RSS feed" },
  { value: "comments", label: "Comments" },
] as const;

const SupportSelectionSchema = z.object(
  Object.fromEntries(
    COLLECTION_SUPPORTS.map((support) => [support, z.boolean()]),
  ) as Record<CollectionSupport, z.ZodBoolean>,
);

export const CmsCollectionSettingsDraftSchema = z
  .object({
    label: z.string(),
    iconName: z.string(),
    kind: z.enum(COLLECTION_KINDS),
    scope: z.enum(COLLECTION_SCOPES),
    urlPattern: z.string(),
    templatePageId: z.string(),
    listPageId: z.string(),
    showInSidebar: z.boolean(),
    supports: SupportSelectionSchema,
    rss: CollectionRssSettingsSchema,
    comments: CollectionCommentsSettingsSchema,
  })
  .strict();

export type CmsCollectionSettingsDraft = z.infer<
  typeof CmsCollectionSettingsDraftSchema
>;

export const CmsCollectionSettingsErrorsSchema = z.record(
  z.string(),
  z.string(),
);
export type CmsCollectionSettingsErrors = z.infer<
  typeof CmsCollectionSettingsErrorsSchema
>;

export const CmsUrlPatternSourceSchema = z.enum(["auto", "manual"]);
export type CmsUrlPatternSource = z.infer<typeof CmsUrlPatternSourceSchema>;

const CmsCollectionUrlPatternSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.startsWith("/"), {
    message: "URL pattern must start with /",
  })
  .refine((value) => value.length === 0 || value.includes("{slug}"), {
    message: "URL pattern must include {slug}",
  });

function createSupportSelection(
  supports: readonly CollectionSupport[],
): Record<CollectionSupport, boolean> {
  return COLLECTION_SUPPORTS.reduce<Record<CollectionSupport, boolean>>(
    (selection, support) => ({
      ...selection,
      [support]: supports.includes(support),
    }),
    {
      body: false,
      cover: false,
      drafts: false,
      revisions: false,
      scheduling: false,
      search: false,
      seo: false,
      rss: false,
      comments: false,
    },
  );
}

export function createCollectionSettingsDraft(
  collection: AriaCollection,
): CmsCollectionSettingsDraft {
  const parsed = AriaCollectionSchema.parse(collection);
  return CmsCollectionSettingsDraftSchema.parse({
    label: parsed.label,
    iconName: parsed.schema.icon ?? "i-hugeicons:file-01",
    kind: parsed.kind,
    scope: parsed.scope,
    urlPattern: parsed.urlPattern ?? "",
    templatePageId: parsed.templatePageId ?? "",
    listPageId: parsed.listPageId ?? "",
    showInSidebar: parsed.schema.navigation?.showInSidebar ?? true,
    supports: createSupportSelection(parsed.supports),
    rss: CollectionRssSettingsSchema.parse(parsed.schema.rss ?? {}),
    comments: CollectionCommentsSettingsSchema.parse(
      parsed.schema.comments ?? {},
    ),
  });
}

function nullableTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function selectedSupports(
  supports: Record<CollectionSupport, boolean>,
): CollectionSupport[] {
  return COLLECTION_SUPPORTS.filter((support) => supports[support]);
}

export function deriveInitialUrlPatternSource(
  collection: AriaCollection,
): CmsUrlPatternSource {
  const parsed = AriaCollectionSchema.parse(collection);
  return parsed.urlPattern?.trim()
    ? CmsUrlPatternSourceSchema.parse("manual")
    : CmsUrlPatternSourceSchema.parse("auto");
}

export function resolveCollectionSettingsUrlPattern(
  collection: AriaCollection,
  draft: CmsCollectionSettingsDraft,
): string {
  const parsedCollection = AriaCollectionSchema.parse(collection);
  const parsedDraft = CmsCollectionSettingsDraftSchema.parse(draft);
  const trimmedPattern = parsedDraft.urlPattern.trim();
  if (trimmedPattern.length > 0) {
    return trimmedPattern;
  }
  if (!parsedDraft.templatePageId.trim()) {
    return "";
  }
  return suggestCollectionUrlPattern({
    collectionName: parsedCollection.name,
  });
}

export function syncUrlPatternForTemplatePage(input: {
  collection: AriaCollection;
  draft: CmsCollectionSettingsDraft;
  source: CmsUrlPatternSource;
}): { urlPattern: string; source: CmsUrlPatternSource } {
  const parsedCollection = AriaCollectionSchema.parse(input.collection);
  const parsedDraft = CmsCollectionSettingsDraftSchema.parse(input.draft);
  const source = CmsUrlPatternSourceSchema.parse(input.source);

  if (source === "manual") {
    return {
      urlPattern: parsedDraft.urlPattern,
      source,
    };
  }

  if (!parsedDraft.templatePageId.trim()) {
    return {
      urlPattern: "",
      source: CmsUrlPatternSourceSchema.parse("auto"),
    };
  }

  return {
    urlPattern: suggestCollectionUrlPattern({
      collectionName: parsedCollection.name,
    }),
    source: CmsUrlPatternSourceSchema.parse("auto"),
  };
}

export function buildCollectionSettingsUpdate(
  collection: AriaCollection,
  draft: CmsCollectionSettingsDraft,
):
  | { success: true; payload: z.infer<typeof UpdateCollectionRequestSchema> }
  | { success: false; errors: CmsCollectionSettingsErrors } {
  const parsedCollection = AriaCollectionSchema.parse(collection);
  const parsedDraft = CmsCollectionSettingsDraftSchema.parse(draft);
  const errors: CmsCollectionSettingsErrors = {};
  const label = parsedDraft.label.trim();

  if (!label) {
    errors.label = "Label is required";
  }

  const resolvedUrlPattern = resolveCollectionSettingsUrlPattern(
    parsedCollection,
    parsedDraft,
  );

  const parsedUrlPattern = CmsCollectionUrlPatternSchema.safeParse(
    resolvedUrlPattern,
  );
  if (!parsedUrlPattern.success) {
    errors.urlPattern =
      parsedUrlPattern.error.issues[0]?.message ?? "URL pattern is invalid";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const payload = UpdateCollectionRequestSchema.parse({
    id: parsedCollection.id,
    expectedUpdatedAt: parsedCollection.updatedAt,
    patch: {
      label,
      icon: parsedDraft.iconName.trim() || null,
      kind: parsedDraft.kind,
      scope: parsedDraft.scope,
      urlPattern: nullableTrimmed(resolvedUrlPattern),
      templatePageId: nullableTrimmed(parsedDraft.templatePageId),
      listPageId: nullableTrimmed(parsedDraft.listPageId),
      navigation: {
        showInSidebar: parsedDraft.showInSidebar,
      },
      supports: selectedSupports(parsedDraft.supports),
      rss: parsedDraft.rss,
      comments: parsedDraft.comments,
    },
  });

  return { success: true, payload };
}
