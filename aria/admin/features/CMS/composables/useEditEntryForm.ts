import { computed, ref, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import {
  AriaEntryRecordSchema,
  UpdateEntryRequestSchema,
  type AriaEntryLocale,
  type AriaEntryRecord,
  type FieldSchema,
} from "../../../../lib/cms/schemas";
import type { EntryStatus } from "../../../../lib/cms/constants";
import {
  plainTextToStructuredText,
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "../../../../lib/cms/structuredText";
import { slugify } from "../../../../lib/utils/slugify";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  buildFrontmatterFromDraft,
  createFrontmatterDraft,
  type CmsFrontmatterDraft,
} from "../lib/frontmatterForm";
import {
  buildEntryRelationsFromDraft,
  createRelationDraft,
  type CmsRelationDraft,
} from "../lib/relationForm";
import { useCmsEntryHistory } from "./useCmsEntryHistory";
import { useSiteSettings } from "@/composables/useSiteSettings";
import {
  DEFAULT_CONTENT_LOCALIZATION,
  resolveContentLocale,
} from "../../../../lib/localization/contentLocale";
import { useStudioI18n } from "@/i18n";
import { getEntryTranslationSourceHash } from "../../../../lib/localization/entryTranslation";

function normalizeBodyDocument(body: unknown): StructuredTextDocument {
  const parsed = StructuredTextDocumentSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return typeof body === "string" ? plainTextToStructuredText(body) : [];
}

export interface UseEditEntryFormReturn {
  currentEntryRecord: Ref<AriaEntryRecord | null>;
  resolvedEntryId: Ref<string>;
  activeLocaleCode: Ref<string>;
  isLocalizedVariant: ComputedRef<boolean>;
  availableLocales: ComputedRef<readonly EntryLocaleOption[]>;
  title: Ref<string>;
  slug: Ref<string>;
  status: Ref<EntryStatus>;
  bodyDocument: Ref<StructuredTextDocument>;
  commentsClosed: Ref<boolean>;
  frontmatterDraft: Ref<CmsFrontmatterDraft>;
  relationDraft: Ref<CmsRelationDraft>;
  version: Ref<string>;
  authorId: Ref<string>;
  authorDisplayName: Ref<string>;
  createdByDisplayName: Ref<string>;
  updatedByDisplayName: Ref<string>;
  publishedByDisplayName: Ref<string>;
  createdAt: Ref<string>;
  updatedAt: Ref<string>;
  publishedAt: Ref<string | null>;
  scheduledFor: Ref<string | null>;
  isSlugEdited: Ref<boolean>;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  hasUnsavedChanges: ComputedRef<boolean>;
  loadError: Ref<string | null>;
  errors: Ref<Record<string, string>>;
  loadEntry: (
    collectionId: string,
    entrySlugOrId: string,
    fields: readonly FieldSchema[],
    locale?: string,
  ) => Promise<boolean>;
  switchActiveLocale: (
    localeCode: string,
    fields: readonly FieldSchema[],
  ) => boolean;
  checkSlugAvailability: (
    collectionId: string,
    entryId: string,
  ) => Promise<boolean>;
  updateSlugFromTitle: () => void;
  markSlugEdited: () => void;
  applyEntryRecord: (record: AriaEntryRecord) => void;
  resetForm: () => void;
  submitUpdate: (
    collectionId: string,
    entryId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
    options?: { showSuccessToast?: boolean },
  ) => Promise<boolean>;
}

export interface EntryLocaleOption {
  code: string;
  label: string;
  status: "available" | "missing" | "unsaved" | "stale";
}

export function useEditEntryForm(): UseEditEntryFormReturn {
  const currentEntryRecord = ref<AriaEntryRecord | null>(null);
  const resolvedEntryId = ref("");
  const { contentLocalization, loadSettings } = useSiteSettings();
  const { t } = useStudioI18n();
  const activeLocaleCode = ref(contentLocalization.value.defaultLocale);
  const isNewLocaleDraft = ref(false);
  const staleLocaleCodes = ref<ReadonlySet<string>>(new Set());
  const currentSourceHash = ref<string | null>(null);
  const isLocalizedVariant = computed(
    () => activeLocaleCode.value !== contentLocalization.value.defaultLocale,
  );
  const availableLocales = computed<readonly EntryLocaleOption[]>(() => {
    const record = currentEntryRecord.value;
    const configured = contentLocalization.value.locales.map((locale) => ({
      code: locale.code,
      label: locale.label,
      status: staleLocaleCodes.value.has(locale.code)
        ? ("stale" as const)
        : record?.locales.some((item) => item.locale === locale.code)
          ? ("available" as const)
          : activeLocaleCode.value === locale.code && isNewLocaleDraft.value
            ? ("unsaved" as const)
            : ("missing" as const),
    }));
    const configuredCodes = new Set(configured.map((locale) => locale.code));
    const legacy = (record?.locales ?? [])
      .filter((locale) => !configuredCodes.has(locale.locale))
      .map((locale) => ({
        code: locale.locale,
        label: locale.locale,
        status: "available" as const,
      }));
    return [...configured, ...legacy];
  });
  const title = ref("");
  const slug = ref("");
  const status = ref<EntryStatus>("draft");
  const bodyDocument = ref<StructuredTextDocument>([]);
  const commentsClosed = ref(false);
  const frontmatterDraft = ref<CmsFrontmatterDraft>({});
  const relationDraft = ref<CmsRelationDraft>({});
  const version = ref("");
  const authorId = ref("");
  const authorDisplayName = ref("");
  const createdByDisplayName = ref("");
  const updatedByDisplayName = ref("");
  const publishedByDisplayName = ref("");
  const createdAt = ref("");
  const updatedAt = ref("");
  const publishedAt = ref<string | null>(null);
  const scheduledFor = ref<string | null>(null);
  const isSlugEdited = ref(false);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const loadError = ref<string | null>(null);
  const errors = ref<Record<string, string>>({});
  const savedFormSnapshot = ref<string | null>(null);
  const entryHistory = useCmsEntryHistory();

  function serializeFormSnapshot(): string {
    return JSON.stringify({
      activeLocaleCode: activeLocaleCode.value,
      title: title.value.trim(),
      slug: slugify(slug.value.trim()),
      bodyDocument: bodyDocument.value,
      commentsClosed: commentsClosed.value,
      frontmatterDraft: frontmatterDraft.value,
      relationDraft: relationDraft.value,
    });
  }

  function captureFormSnapshot(): void {
    savedFormSnapshot.value = serializeFormSnapshot();
  }

  const hasUnsavedChanges = computed(() => {
    if (isNewLocaleDraft.value) return true;
    if (savedFormSnapshot.value === null) {
      return false;
    }
    return serializeFormSnapshot() !== savedFormSnapshot.value;
  });

  function hasChangedFormValues(): boolean {
    return (
      savedFormSnapshot.value !== null &&
      serializeFormSnapshot() !== savedFormSnapshot.value
    );
  }

  function resetForm(): void {
    currentEntryRecord.value = null;
    resolvedEntryId.value = "";
    activeLocaleCode.value = contentLocalization.value.defaultLocale;
    isNewLocaleDraft.value = false;
    staleLocaleCodes.value = new Set();
    currentSourceHash.value = null;
    title.value = "";
    slug.value = "";
    status.value = "draft";
    bodyDocument.value = [];
    commentsClosed.value = false;
    frontmatterDraft.value = {};
    relationDraft.value = {};
    version.value = "";
    authorId.value = "";
    authorDisplayName.value = "";
    createdByDisplayName.value = "";
    updatedByDisplayName.value = "";
    publishedByDisplayName.value = "";
    createdAt.value = "";
    updatedAt.value = "";
    publishedAt.value = null;
    scheduledFor.value = null;
    isSlugEdited.value = false;
    savedFormSnapshot.value = null;
    loadError.value = null;
    errors.value = {};
  }

  function applyFormFromLocale(
    record: AriaEntryRecord,
    locale: AriaEntryLocale,
    fields: readonly FieldSchema[],
    activeLocale = locale.locale,
  ): void {
    activeLocaleCode.value = activeLocale;
    title.value = locale.title;
    slug.value = locale.slug;
    bodyDocument.value = normalizeBodyDocument(locale.body);
    commentsClosed.value = locale.commentsClosed ?? false;
    frontmatterDraft.value = createFrontmatterDraft(fields, locale.frontmatter);
    relationDraft.value = createRelationDraft(fields, record.relations);
  }

  function switchActiveLocale(
    localeCode: string,
    fields: readonly FieldSchema[],
  ): boolean {
    if (hasChangedFormValues()) {
      toast.error("Save or discard changes before switching locale");
      return false;
    }

    const record = currentEntryRecord.value;
    if (!record) {
      return false;
    }

    const resolved = resolveContentLocale(
      record.locales,
      contentLocalization.value,
      localeCode,
    );
    if (!resolved) {
      return false;
    }

    applyFormFromLocale(record, resolved.locale, fields, localeCode);
    isNewLocaleDraft.value = !record.locales.some(
      (item) => item.locale === localeCode,
    );
    captureFormSnapshot();
    return true;
  }

  async function loadEntry(
    collectionId: string,
    entrySlugOrId: string,
    fields: readonly FieldSchema[],
    locale?: string,
  ): Promise<boolean> {
    isLoading.value = true;
    loadError.value = null;

    try {
      await loadSettings();
      const { data, error } = await actions.cms.entries.get({
        collectionId,
        idOrSlug: entrySlugOrId,
        locale,
        include: ["relations"],
      });

      if (error) {
        if (handleActionResultForbidden({ error }, "cms.entries.get")) {
          loadError.value = "You do not have permission to view this entry.";
          return false;
        }
        loadError.value = error.message ?? "Failed to load entry";
        return false;
      }

      const record = AriaEntryRecordSchema.parse(data);
      const resolvedLocale = resolveContentLocale(
        record.locales,
        contentLocalization.value ?? DEFAULT_CONTENT_LOCALIZATION,
        locale,
      );
      if (!resolvedLocale) {
        loadError.value = "Entry is missing locale data";
        return false;
      }

      currentEntryRecord.value = record;
      const sourceLocale =
        record.locales.find((item) => item.isSource) ?? record.locales[0];
      if (sourceLocale) {
        const sourceHash = await getEntryTranslationSourceHash(sourceLocale);
        currentSourceHash.value = sourceHash;
        staleLocaleCodes.value = new Set(
          record.locales
            .filter(
              (item) =>
                !item.isSource &&
                item.translationMeta?.sourceContentHash != null &&
                item.translationMeta.sourceContentHash !== sourceHash,
            )
            .map((item) => item.locale),
        );
      }
      resolvedEntryId.value = record.entry.id;
      isSlugEdited.value = false;
      status.value = record.entry.status;
      version.value = record.entry.version;
      applyFormFromLocale(
        record,
        resolvedLocale.locale,
        fields,
        locale ?? resolvedLocale.resolvedLocale,
      );
      isNewLocaleDraft.value = !record.locales.some(
        (item) => item.locale === activeLocaleCode.value,
      );
      authorId.value = record.entry.authorId;
      authorDisplayName.value =
        record.authorship?.author?.username ?? record.entry.authorId;
      createdByDisplayName.value = record.authorship?.createdBy?.username ?? "";
      updatedByDisplayName.value =
        record.authorship?.updatedBy?.username ?? authorDisplayName.value;
      publishedByDisplayName.value =
        record.authorship?.publishedBy?.username ?? "";
      createdAt.value = record.entry.createdAt;
      updatedAt.value = record.entry.updatedAt;
      publishedAt.value = record.entry.publishedAt;
      scheduledFor.value = record.entry.scheduledFor;
      captureFormSnapshot();
      return true;
    } finally {
      isLoading.value = false;
    }
  }

  function updateSlugFromTitle(): void {
    if (isSlugEdited.value) return;
    slug.value = slugify(title.value);
  }

  function markSlugEdited(): void {
    isSlugEdited.value = true;
  }

  function applySavedRecord(record: AriaEntryRecord): void {
    currentEntryRecord.value = record;
    resolvedEntryId.value = record.entry.id;
    status.value = record.entry.status;
    version.value = record.entry.version;
    const locale =
      record.locales.find((item) => item.locale === activeLocaleCode.value) ??
      record.locales.find((item) => item.isSource) ??
      record.locales[0];
    if (locale) {
      title.value = locale.title;
      slug.value = locale.slug;
      bodyDocument.value = normalizeBodyDocument(locale.body);
      commentsClosed.value = locale.commentsClosed ?? false;
    }
    isNewLocaleDraft.value = false;
    authorId.value = record.entry.authorId;
    authorDisplayName.value =
      record.authorship?.author?.username ?? record.entry.authorId;
    createdByDisplayName.value = record.authorship?.createdBy?.username ?? "";
    updatedByDisplayName.value =
      record.authorship?.updatedBy?.username ?? authorDisplayName.value;
    publishedByDisplayName.value =
      record.authorship?.publishedBy?.username ?? "";
    createdAt.value = record.entry.createdAt;
    updatedAt.value = record.entry.updatedAt;
    publishedAt.value = record.entry.publishedAt;
    scheduledFor.value = record.entry.scheduledFor;
    captureFormSnapshot();
  }

  function buildFrontmatter(
    fields: readonly FieldSchema[],
  ): Record<string, unknown> | null {
    try {
      return buildFrontmatterFromDraft(fields, frontmatterDraft.value);
    } catch (err) {
      errors.value.frontmatter =
        err instanceof Error ? err.message : "Invalid frontmatter";
      return null;
    }
  }

  function buildBodyDocument(): StructuredTextDocument | null {
    const parsed = StructuredTextDocumentSchema.safeParse(bodyDocument.value);
    if (!parsed.success) {
      errors.value.body = "Body content is invalid";
      return null;
    }
    return parsed.data;
  }

  function buildUpdatePatch(
    entryId: string,
    fields: readonly FieldSchema[],
    frontmatter: Record<string, unknown>,
    body: StructuredTextDocument,
    bodyEnabled: boolean,
  ) {
    const patch: {
      title: string;
      slug: string;
      locale: string;
      frontmatter: Record<string, unknown>;
      relations: ReturnType<typeof buildEntryRelationsFromDraft>;
      body?: StructuredTextDocument | null;
      commentsClosed: boolean;
      status?: EntryStatus;
      translationMeta?: NonNullable<AriaEntryLocale["translationMeta"]>;
    } = {
      title: title.value.trim(),
      slug: slugify(slug.value.trim()),
      locale: activeLocaleCode.value,
      frontmatter,
      relations: buildEntryRelationsFromDraft(
        entryId,
        fields,
        relationDraft.value,
      ),
      ...(bodyEnabled ? { body: body.length > 0 ? body : null } : {}),
      commentsClosed: commentsClosed.value,
    };

    if (status.value !== "published" && status.value !== "scheduled") {
      patch.status = status.value;
    }
    if (
      activeLocaleCode.value !==
        currentEntryRecord.value?.locales.find((locale) => locale.isSource)
          ?.locale &&
      currentSourceHash.value
    ) {
      patch.translationMeta = {
        method: "manual",
        sourceLocale:
          currentEntryRecord.value?.locales.find((locale) => locale.isSource)
            ?.locale ?? contentLocalization.value.defaultLocale,
        sourceContentHash: currentSourceHash.value,
        generatedAt: new Date().toISOString(),
        translatedFieldPaths: [],
      };
    }

    return patch;
  }

  function validate(
    collectionId: string,
    entryId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
  ): boolean {
    errors.value = {};
    const frontmatter = buildFrontmatter(fields);
    const body = bodyEnabled ? buildBodyDocument() : [];
    if (!frontmatter || !body) {
      return false;
    }

    const parsed = UpdateEntryRequestSchema.safeParse({
      collectionId,
      id: entryId,
      version: version.value,
      patch: buildUpdatePatch(entryId, fields, frontmatter, body, bodyEnabled),
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.at(-1);
        if (typeof field === "string" && !errors.value[field]) {
          errors.value[field] = issue.message;
        }
      }
    }

    return Object.keys(errors.value).length === 0;
  }

  async function checkSlugAvailability(
    collectionId: string,
    entryId: string,
  ): Promise<boolean> {
    const normalizedSlug = slugify(slug.value.trim());
    if (!normalizedSlug) return true;

    const { data, error } = await actions.cms.entries.checkSlugAvailability({
      collectionId,
      locale: activeLocaleCode.value,
      slug: normalizedSlug,
      excludeEntryId: entryId,
    });
    if (error || !data?.available) {
      errors.value.slug = t("cms.slugConflict", {
        locale: activeLocaleCode.value,
      });
      return false;
    }
    delete errors.value.slug;
    return true;
  }

  async function submitUpdate(
    collectionId: string,
    entryId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
    options: { showSuccessToast?: boolean } = {},
  ): Promise<boolean> {
    if (isSaving.value) return false;
    if (!validate(collectionId, entryId, fields, bodyEnabled)) {
      toast.error(t("cms.entryInvalid"));
      return false;
    }
    if (!(await checkSlugAvailability(collectionId, entryId))) {
      return false;
    }
    const frontmatter = buildFrontmatter(fields);
    const body = bodyEnabled ? buildBodyDocument() : [];
    if (!frontmatter || !body) {
      toast.error(t("cms.entryInvalid"));
      return false;
    }

    const payload = UpdateEntryRequestSchema.parse({
      collectionId,
      id: entryId,
      version: version.value,
      patch: buildUpdatePatch(entryId, fields, frontmatter, body, bodyEnabled),
    });

    isSaving.value = true;
    try {
      const record = await entryHistory.recordUpdateEntry({
        payload,
        description: `Update "${title.value.trim() || "entry"}"`,
        afterRedo: applySavedRecord,
        afterUndo: applySavedRecord,
      });
      if (!record) {
        toast.error("Failed to update entry");
        return false;
      }
      applySavedRecord(record);
      if (options.showSuccessToast !== false) {
        toast.success(t("cms.entrySaved"));
      }
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update entry",
      );
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  return {
    currentEntryRecord,
    resolvedEntryId,
    activeLocaleCode,
    isLocalizedVariant,
    availableLocales,
    title,
    slug,
    status,
    bodyDocument,
    commentsClosed,
    frontmatterDraft,
    relationDraft,
    version,
    authorId,
    authorDisplayName,
    createdByDisplayName,
    updatedByDisplayName,
    publishedByDisplayName,
    createdAt,
    updatedAt,
    publishedAt,
    scheduledFor,
    isSlugEdited,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    loadError,
    errors,
    loadEntry,
    switchActiveLocale,
    checkSlugAvailability,
    updateSlugFromTitle,
    markSlugEdited,
    applyEntryRecord: applySavedRecord,
    resetForm,
    submitUpdate,
  };
}
