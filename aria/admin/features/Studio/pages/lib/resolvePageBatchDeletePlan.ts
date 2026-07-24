import { HOME_PAGE_SLUG } from "@/features/Studio/composer/composables/studioCrudShared";

export interface PageBatchDeleteSkipped {
  slug: string;
  reason: string;
}

export interface PageBatchDeletePlan {
  ordered: string[];
  skipped: PageBatchDeleteSkipped[];
}

interface PageInventoryEntry {
  slug: string;
  parent?: string;
}

export function resolvePageBatchDeletePlan(
  slugs: readonly string[],
  pages: readonly PageInventoryEntry[],
): PageBatchDeletePlan {
  const slugSet = new Set(slugs);
  const skipped: PageBatchDeleteSkipped[] = [];
  const deletable: string[] = [];

  for (const slug of slugs) {
    if (slug === HOME_PAGE_SLUG) {
      skipped.push({ slug, reason: "Home page cannot be deleted" });
      continue;
    }

    const hasUndeletedChild = pages.some(
      (page) => page.parent === slug && !slugSet.has(page.slug),
    );
    if (hasUndeletedChild) {
      skipped.push({
        slug,
        reason: "Move or delete child pages before deleting this page",
      });
      continue;
    }

    deletable.push(slug);
  }

  const remaining = new Set(deletable);
  const ordered: string[] = [];

  while (remaining.size > 0) {
    let progressed = false;

    for (const slug of [...remaining]) {
      const hasRemainingChild = pages.some(
        (page) => page.parent === slug && remaining.has(page.slug),
      );
      if (!hasRemainingChild) {
        ordered.push(slug);
        remaining.delete(slug);
        progressed = true;
      }
    }

    if (!progressed) {
      for (const slug of remaining) {
        skipped.push({ slug, reason: "Could not resolve delete order" });
      }
      break;
    }
  }

  return { ordered, skipped };
}
