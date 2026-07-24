import { ref, type Ref } from "vue";
import { toast } from "vue-sonner";
import {
  CreateEntryRequestSchema,
  type FieldSchema,
} from "../../../../lib/cms/schemas";
import type { EntryStatus } from "../../../../lib/cms/constants";
import {
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "../../../../lib/cms/structuredText";
import { slugify } from "../../../../lib/utils/slugify";
import {
  buildFrontmatterFromDraft,
  createFrontmatterDraft,
  type CmsFrontmatterDraft,
} from "../lib/frontmatterForm";
import { useCmsEntryHistory } from "./useCmsEntryHistory";

export interface UseCreateEntryFormReturn {
  title: Ref<string>;
  slug: Ref<string>;
  status: Ref<EntryStatus>;
  bodyDocument: Ref<StructuredTextDocument>;
  frontmatterDraft: Ref<CmsFrontmatterDraft>;
  isSlugEdited: Ref<boolean>;
  isCreating: Ref<boolean>;
  errors: Ref<Record<string, string>>;
  resetFrontmatter: (fields: readonly FieldSchema[]) => void;
  updateSlugFromTitle: () => void;
  resetForm: () => void;
  submitCreate: (
    collectionId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
  ) => Promise<string | null>;
}

export function useCreateEntryForm(): UseCreateEntryFormReturn {
  const title = ref("");
  const slug = ref("");
  const status = ref<EntryStatus>("draft");
  const bodyDocument = ref<StructuredTextDocument>([]);
  const frontmatterDraft = ref<CmsFrontmatterDraft>({});
  const isSlugEdited = ref(false);
  const isCreating = ref(false);
  const errors = ref<Record<string, string>>({});
  const entryHistory = useCmsEntryHistory();

  function updateSlugFromTitle(): void {
    if (!isSlugEdited.value) {
      slug.value = slugify(title.value);
    }
  }

  function resetForm(): void {
    title.value = "";
    slug.value = "";
    status.value = "draft";
    bodyDocument.value = [];
    frontmatterDraft.value = {};
    isSlugEdited.value = false;
    errors.value = {};
  }

  function resetFrontmatter(fields: readonly FieldSchema[]): void {
    frontmatterDraft.value = createFrontmatterDraft(fields);
  }

  function buildFrontmatter(fields: readonly FieldSchema[]): Record<string, unknown> | null {
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

  function validate(
    collectionId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
  ): boolean {
    errors.value = {};

    const slugValue = slug.value.trim() || slugify(title.value);
    const body = bodyEnabled ? buildBodyDocument() : [];
    const frontmatter = buildFrontmatter(fields);
    if (!frontmatter || !body) {
      return false;
    }

    const parsed = CreateEntryRequestSchema.safeParse({
      collectionId,
      title: title.value.trim(),
      slug: slugValue || undefined,
      status: status.value,
      body: bodyEnabled && body.length > 0 ? body : undefined,
      frontmatter,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !errors.value[field]) {
          errors.value[field] = issue.message;
        }
      }
    }

    return Object.keys(errors.value).length === 0;
  }

  async function submitCreate(
    collectionId: string,
    fields: readonly FieldSchema[],
    bodyEnabled: boolean,
  ): Promise<string | null> {
    if (isCreating.value) return null;
    if (!validate(collectionId, fields, bodyEnabled)) return null;

    const slugValue = slug.value.trim() || slugify(title.value);
    const body = bodyEnabled ? buildBodyDocument() : [];
    const frontmatter = buildFrontmatter(fields);
    if (!frontmatter || !body) return null;

    const payload = CreateEntryRequestSchema.parse({
      collectionId,
      title: title.value.trim(),
      slug: slugValue,
      status: status.value,
      body: bodyEnabled && body.length > 0 ? body : undefined,
      frontmatter,
    });

    isCreating.value = true;
    try {
      const record = await entryHistory.recordCreateEntry({
        payload,
        description: `Create "${payload.title}"`,
      });
      if (!record) return null;
      toast.success(`Created "${record.locales[0]?.title ?? "entry"}"`);
      resetForm();
      return record.entry.id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create entry");
      return null;
    } finally {
      isCreating.value = false;
    }
  }

  return {
    title,
    slug,
    status,
    bodyDocument,
    frontmatterDraft,
    isSlugEdited,
    isCreating,
    errors,
    resetFrontmatter,
    updateSlugFromTitle,
    resetForm,
    submitCreate,
  };
}
