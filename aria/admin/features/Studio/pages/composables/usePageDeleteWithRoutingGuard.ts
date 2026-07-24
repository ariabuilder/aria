import { computed, ref } from "vue";
import { toast } from "vue-sonner";

import { useDialogState } from "@/features/Studio/core/composables";
import { useCmsCapabilities } from "@/features/CMS/composables/useCmsCapabilities";
import type { PageCmsRoutingImpact } from "../../../../../lib/pages/cmsTemplatePolicy";
import {
  usePageDeleteRoutingGuard,
  type PageDeleteCanonicalIdentity,
} from "./usePageDeleteRoutingGuard";

interface DeletePageFn {
  (slug: string, options?: { silent?: boolean }): Promise<boolean>;
}

interface UsePageDeleteWithRoutingGuardOptions {
  deletePage: DeletePageFn;
  resolvePageId: (slug: string) => string | null | undefined;
  onDeleted?: () => Promise<void> | void;
}

export function usePageDeleteWithRoutingGuard(
  options: UsePageDeleteWithRoutingGuardOptions,
) {
  const routingBlockedDialog = useDialogState();
  const routingGuard = usePageDeleteRoutingGuard();
  const { canUpdateCollection } = useCmsCapabilities();

  const blockedSlug = ref<string | null>(null);
  const blockedPageLabel = ref<string | null>(null);
  const blockedImpact = ref<PageCmsRoutingImpact | null>(null);
  const isUnbinding = ref(false);

  const blockedMessagePageLabel = computed(
    () => blockedPageLabel.value ?? blockedSlug.value ?? undefined,
  );

  function clearBlockedState(): void {
    blockedSlug.value = null;
    blockedPageLabel.value = null;
    blockedImpact.value = null;
  }

  function openBlockedDialog(input: {
    slug: string;
    pageLabel?: string | null;
    impact: PageCmsRoutingImpact;
  }): void {
    blockedSlug.value = input.slug;
    blockedPageLabel.value = input.pageLabel?.trim() || input.slug;
    blockedImpact.value = input.impact;
    routingBlockedDialog.open();
  }

  async function resolveIdentity(
    slug: string,
  ): Promise<PageDeleteCanonicalIdentity | null> {
    return routingGuard.resolveCanonicalPageIdentity(
      slug,
      options.resolvePageId(slug),
    );
  }

  async function checkRoutingBlock(input: {
    slug: string;
    pageLabel?: string | null;
    identity?: PageDeleteCanonicalIdentity | null;
  }): Promise<boolean> {
    const identity = input.identity ?? (await resolveIdentity(input.slug));
    if (!identity) {
      return false;
    }

    const loaded = await routingGuard.ensureCollections();
    if (!loaded) {
      return false;
    }

    const impact = routingGuard.getRoutingImpact(identity);
    if (!impact) {
      return false;
    }

    openBlockedDialog({
      slug: input.slug,
      pageLabel: input.pageLabel,
      impact,
    });
    return true;
  }

  async function deletePageWithGuard(input: {
    slug: string;
    pageLabel?: string | null;
    silent?: boolean;
  }): Promise<boolean> {
    const identity = await resolveIdentity(input.slug);
    if (!identity) {
      toast.error("Could not verify page before deletion.");
      return false;
    }

    const blocked = await checkRoutingBlock({
      ...input,
      identity,
    });
    if (blocked) {
      return false;
    }

    const deleted = await options.deletePage(input.slug, {
      silent: input.silent,
    });

    if (!deleted) {
      const blockedAfterDelete = await checkRoutingBlock({
        ...input,
        identity,
      });
      if (blockedAfterDelete) {
        return false;
      }

      if (input.silent) {
        toast.error("Page could not be deleted.");
      }
      return false;
    }

    await options.onDeleted?.();
    return true;
  }

  async function confirmUnbindAndDelete(): Promise<boolean> {
    const slug = blockedSlug.value;
    const impact = blockedImpact.value;
    if (!slug || !impact) {
      return false;
    }

    isUnbinding.value = true;
    try {
      await routingGuard.unbindPageFromCollections(impact);
      const deleted = await options.deletePage(slug, { silent: true });
      routingBlockedDialog.close();
      clearBlockedState();

      if (!deleted) {
        toast.error("Page could not be deleted after unbinding collection routes.");
        return false;
      }

      toast.success("Page deleted");
      await options.onDeleted?.();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to unbind collection routes.",
      );
      return false;
    } finally {
      isUnbinding.value = false;
    }
  }

  function cancelBlockedDelete(): void {
    routingBlockedDialog.close();
    clearBlockedState();
  }

  return {
    blockedDialogOpen: routingBlockedDialog.isOpen,
    blockedImpact,
    blockedMessagePageLabel,
    canUnbindCollections: canUpdateCollection,
    isUnbinding,
    deletePageWithGuard,
    confirmUnbindAndDelete,
    cancelBlockedDelete,
  };
}
