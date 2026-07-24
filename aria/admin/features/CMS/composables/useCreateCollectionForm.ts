import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import {
  AriaCollectionSchema,
  CreateCollectionRequestSchema,
} from "../../../../lib/cms/schemas";
import type {
  CollectionKind,
  CollectionSupport,
} from "../../../../lib/cms/constants";
import { slugify } from "../../../../lib/utils/slugify";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { withCmsActionTimeout } from "../lib/actionTimeout";
import { useCollectionsList } from "./useCollectionsList";

export interface CreatedCollectionResult {
  id: string;
  name: string;
  label: string;
  kind: CollectionKind;
  icon?: string;
}

export interface UseCreateCollectionFormReturn {
  label: Ref<string>;
  name: Ref<string>;
  kind: Ref<CollectionKind>;
  iconName: Ref<string>;
  isNameEdited: Ref<boolean>;
  isCreating: Ref<boolean>;
  errors: Ref<Record<string, string>>;
  updateNameFromLabel: () => void;
  resetForm: () => void;
  submitCreate: () => Promise<CreatedCollectionResult | null>;
}

export function useCreateCollectionForm(): UseCreateCollectionFormReturn {
  const { collectionNames, loadCollections } = useCollectionsList();

  const label = ref("");
  const name = ref("");
  const kind = ref<CollectionKind>("content");
  const iconName = ref("i-hugeicons:file-01");
  const isNameEdited = ref(false);
  const isCreating = ref(false);
  const errors = ref<Record<string, string>>({});

  function defaultSupportsForKind(
    collectionKind: CollectionKind,
  ): CollectionSupport[] {
    return collectionKind === "content" ? ["body", "cover"] : [];
  }

  function updateNameFromLabel(): void {
    if (!isNameEdited.value) {
      name.value = slugify(label.value);
    }
  }

  function resetForm(): void {
    label.value = "";
    name.value = "";
    kind.value = "content";
    iconName.value = "i-hugeicons:file-01";
    isNameEdited.value = false;
    errors.value = {};
  }

  function validate(): boolean {
    errors.value = {};

    if (!label.value.trim()) {
      errors.value.label = "Label is required";
    }

    const slug = name.value.trim() || slugify(label.value);
    if (!slug) {
      errors.value.name = "API name is required";
    }

    if (collectionNames.value.includes(slug)) {
      errors.value.name = `Collection "${slug}" already exists`;
    }

    const parsed = CreateCollectionRequestSchema.safeParse({
      name: slug,
      label: label.value.trim(),
      kind: kind.value,
      icon: iconName.value.trim() || undefined,
      fields: [],
      supports: defaultSupportsForKind(kind.value),
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

  async function submitCreate(): Promise<CreatedCollectionResult | null> {
    if (isCreating.value) return null;
    if (!validate()) return null;

    const slug = name.value.trim() || slugify(label.value);
    const payload = CreateCollectionRequestSchema.parse({
      name: slug,
      label: label.value.trim(),
      kind: kind.value,
      icon: iconName.value.trim() || undefined,
      fields: [],
      supports: defaultSupportsForKind(kind.value),
    });

    isCreating.value = true;
    try {
      const { data, error } = await withCmsActionTimeout(
        actions.cms.collections.create(payload),
        "Create collection",
      );

      if (error) {
        if (handleActionResultForbidden({ error }, "cms.collections.create")) {
          return null;
        }
        toast.error(error.message ?? "Failed to create collection");
        return null;
      }

      const collection = AriaCollectionSchema.parse(data);
      const result: CreatedCollectionResult = {
        id: collection.id,
        name: collection.name,
        label: collection.label,
        kind: collection.kind,
        icon: collection.schema.icon,
      };
      try {
        await withCmsActionTimeout(
          loadCollections({ force: true }),
          "Refresh collections",
        );
      } catch {
        toast.warning("Collection created, but the list did not refresh.");
      }
      toast.success(`Created collection "${collection.label}"`);
      resetForm();
      return result;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create collection",
      );
      return null;
    } finally {
      isCreating.value = false;
    }
  }

  return {
    label,
    name,
    kind,
    iconName,
    isNameEdited,
    isCreating,
    errors,
    updateNameFromLabel,
    resetForm,
    submitCreate,
  };
}
