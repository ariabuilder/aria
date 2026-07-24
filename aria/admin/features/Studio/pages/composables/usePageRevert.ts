import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";
import { ActorRefSchema, type ActorRef } from "../../../../../lib/auth/types";
import { formatActorDisplayName } from "../../../../../lib/authorship/reads";
import { useErrorBoundary } from "@/features/Studio/core/composables/useErrorBoundary";
import { PAGE_DETAIL_ERROR_CODES } from "@/lib/errors/pageDetailErrors";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";

/**
 * Zod schemas for version operations
 */

export const GetPageVersionsInputSchema = z.object({
  slug: z.string().min(1),
});

export const VersionEntrySchema = z.object({
  version: z.string(),
  displayVersion: z.int().positive(),
  createdAt: z.string(),
  createdBy: ActorRefSchema.optional(),
  authorName: z.string().optional(),
  activity: z
    .object({
      action: z.string(),
      userName: z.string(),
      target: z.string(),
    })
    .nullable(),
});

export const GetVersionSnapshotInputSchema = z.object({
  slug: z.string().min(1),
  versionId: z.string().min(1),
});

export const GetVersionSnapshotOutputSchema = z.object({
  dsl: z.record(z.string(), z.unknown()),
});

export const RevertVersionInputSchema = z.object({
  slug: z.string().min(1),
  versionId: z.string().min(1),
});

export const RevertVersionOutputSchema = z.object({
  version: z.string(),
});

export const DeleteVersionInputSchema = z.object({
  slug: z.string().min(1),
  versionId: z.string().min(1),
});

export const DeleteVersionOutputSchema = z.object({
  success: z.literal(true),
});

export const GetPageVersionsOutputSchema = z.object({
  versions: z.array(VersionEntrySchema),
  protectedVersions: z.array(z.string()),
});

export interface VersionEntry {
  version: string;
  displayVersion: number;
  createdAt: string;
  createdBy?: ActorRef;
  authorName?: string;
  activity: {
    action: string;
    userName: string;
    target: string;
  } | null;
}

function normalizeVersionEntry(
  entry: z.infer<typeof VersionEntrySchema>,
): VersionEntry {
  return {
    ...entry,
    authorName:
      entry.authorName ??
      (entry.createdBy ? formatActorDisplayName(entry.createdBy) : undefined),
  };
}

export interface UsePageRevertReturn {
  versions: Ref<VersionEntry[]>;
  /** Version ids that cannot be deleted (draft, published, current) */
  protectedVersions: Ref<Set<string>>;
  isLoading: Ref<boolean>;
  isReverting: Ref<boolean>;
  isDeleting: Ref<boolean>;
  /** Load version list for a page */
  loadVersions: (slug: string) => Promise<void>;
  revertToVersion: (slug: string, versionId: string) => Promise<boolean>;
  deleteVersion: (slug: string, versionId: string) => Promise<boolean>;
}

/**
 * Composable for version history and revert operations.
 */
export function usePageRevert(): UsePageRevertReturn {
  const versions = ref<VersionEntry[]>([]);
  const protectedVersions = ref<Set<string>>(new Set());
  const isLoading = ref(false);
  const isReverting = ref(false);
  const isDeleting = ref(false);
  const errorBoundary = useErrorBoundary();
  const {
    canRevertPageVersion,
    canDeletePageVersion,
    getForbiddenMessage,
  } = useStudioCapabilities();
  let loadGeneration = 0;

  async function loadVersions(slug: string): Promise<void> {
    const generation = loadGeneration + 1;
    loadGeneration = generation;
    isLoading.value = true;
    versions.value = [];
    protectedVersions.value = new Set();
    try {
      const { data, error } = await actions.pages.getVersions({ slug });

      if (generation !== loadGeneration) {
        return;
      }

      if (error) {
        errorBoundary.handleError(
          PAGE_DETAIL_ERROR_CODES.VERSION_FETCH_FAILED,
          error.message ?? "Failed to load versions",
          { severity: "error" },
        );
        return;
      }

      const output = GetPageVersionsOutputSchema.parse(data);
      if (generation !== loadGeneration) {
        return;
      }

      versions.value = output.versions.map(normalizeVersionEntry);
      protectedVersions.value = new Set(output.protectedVersions);
    } catch (err) {
      if (generation !== loadGeneration) {
        return;
      }

      errorBoundary.handleError(
        PAGE_DETAIL_ERROR_CODES.VERSION_FETCH_FAILED,
        err instanceof Error ? err.message : "Failed to load versions",
        { severity: "error" },
      );
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false;
      }
    }
  }

  async function revertToVersion(
    slug: string,
    versionId: string,
  ): Promise<boolean> {
    if (!canRevertPageVersion.value) {
      toast.error(getForbiddenMessage("pages.revertVersion"));
      return false;
    }

    isReverting.value = true;
    try {
      const { data, error } = await actions.pages.revertVersion({
        slug,
        versionId,
      });

      if (error) {
        if (handleActionResultForbidden({ error }, "pages.revertVersion")) {
          return false;
        }

        errorBoundary.handleError(
          PAGE_DETAIL_ERROR_CODES.REVERT_FAILED,
          error.message ?? "Failed to revert version",
          {
            severity: "error",
            retry: async () => {
              await revertToVersion(slug, versionId);
            },
          },
        );
        return false;
      }

      RevertVersionOutputSchema.parse(data);
      return true;
    } catch (err) {
      errorBoundary.handleError(
        PAGE_DETAIL_ERROR_CODES.REVERT_FAILED,
        err instanceof Error ? err.message : "Failed to revert",
        { severity: "error" },
      );
      return false;
    } finally {
      isReverting.value = false;
    }
  }

  async function deleteVersion(
    slug: string,
    versionId: string,
  ): Promise<boolean> {
    if (!canDeletePageVersion.value) {
      toast.error(getForbiddenMessage("pages.deleteVersion"));
      return false;
    }

    isDeleting.value = true;
    try {
      const { data, error } = await actions.pages.deleteVersion({
        slug,
        versionId,
      });

      if (error) {
        if (handleActionResultForbidden({ error }, "pages.deleteVersion")) {
          return false;
        }

        errorBoundary.handleError(
          PAGE_DETAIL_ERROR_CODES.VERSION_DELETE_FAILED,
          error.message ?? "Failed to delete version",
          {
            severity: "error",
            retry: async () => {
              await deleteVersion(slug, versionId);
            },
          },
        );
        return false;
      }

      DeleteVersionOutputSchema.parse(data);
      return true;
    } catch (err) {
      errorBoundary.handleError(
        PAGE_DETAIL_ERROR_CODES.VERSION_DELETE_FAILED,
        err instanceof Error ? err.message : "Failed to delete version",
        { severity: "error" },
      );
      return false;
    } finally {
      isDeleting.value = false;
    }
  }

  return {
    versions,
    protectedVersions,
    isLoading,
    isReverting,
    isDeleting,
    loadVersions,
    revertToVersion,
    deleteVersion,
  };
}
