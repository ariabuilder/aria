import { z } from "zod";
import type { LayoutDSL } from "../../../../lib/types/nodes";
import type { useItemLoading } from "../../../composables/useItemLoading";
import { log } from "@/lib/utils/logger";

const StageLoadingSlugSchema = z.string().trim().min(1);

export interface UseStageLoadingActionsDeps {
  itemLoading: ReturnType<typeof useItemLoading>;
}

export interface UseStageLoadingActionsReturn {
  handleLoadPage: (slug: string) => Promise<void>;
  handleLoadLayout: (slug: string) => Promise<void>;
  handleLoadComponent: (slug: string) => Promise<void>;
  handleLoadLayoutDataOnly: (slug: string) => Promise<LayoutDSL | null>;
}

export function useStageLoadingActions(
  deps: UseStageLoadingActionsDeps,
): UseStageLoadingActionsReturn {
  const { itemLoading } = deps;

  const parseSlug = (slug: string, action: string): string | null => {
    const parsedSlug = StageLoadingSlugSchema.safeParse(slug);
    if (!parsedSlug.success) {
      log("warn", `[useStageLoadingActions] Ignoring invalid ${action} slug`, {
        slug,
      });
      return null;
    }

    return parsedSlug.data;
  };

  const handleLoadPage = async (slug: string): Promise<void> => {
    const parsedSlug = parseSlug(slug, "page load");
    if (!parsedSlug) {
      return;
    }

    await itemLoading.loadPage(parsedSlug);
  };

  const handleLoadLayout = async (slug: string): Promise<void> => {
    const parsedSlug = parseSlug(slug, "layout load");
    if (!parsedSlug) {
      return;
    }

    await itemLoading.loadLayout(parsedSlug);
  };

  const handleLoadComponent = async (slug: string): Promise<void> => {
    const parsedSlug = parseSlug(slug, "component load");
    if (!parsedSlug) {
      return;
    }

    await itemLoading.loadComponent(parsedSlug);
  };

  const handleLoadLayoutDataOnly = async (
    slug: string,
  ): Promise<LayoutDSL | null> => {
    const parsedSlug = parseSlug(slug, "layout metadata load");
    if (!parsedSlug) {
      return null;
    }

    return (await itemLoading.loadLayoutDataOnly(parsedSlug)) ?? null;
  };

  return {
    handleLoadPage,
    handleLoadLayout,
    handleLoadComponent,
    handleLoadLayoutDataOnly,
  };
}
