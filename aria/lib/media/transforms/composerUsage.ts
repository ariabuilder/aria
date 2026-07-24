import type { StorageAdapter } from "../../storage/adapter";
import { collectComposerVariantReferences } from "../composerReference";

export type ComposerVariantUsage = {
  kind:
    | "page"
    | "published-page"
    | "layout"
    | "component"
    | "design-system"
    | "page-locale"
    | "layout-locale";
  refId: string;
  refPath: string;
};

const PAGE_SIZE = 500;

export async function findComposerVariantUsage(
  adapter: StorageAdapter,
  variantId: string,
): Promise<ComposerVariantUsage[]> {
  const usages: ComposerVariantUsage[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const pages = await adapter.listPagesDSL({ limit: PAGE_SIZE, offset });
    for (const page of pages) {
      const draft = await adapter.getPageDSL(page.id);
      if (draft) append(usages, "page", page.id, draft, variantId);
      const published = await adapter.getPublishedPageDSL(page.id);
      if (published) {
        append(usages, "published-page", page.id, published, variantId);
      }
    }
    if (pages.length < PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const layouts = await adapter.listLayoutsDSL({ limit: PAGE_SIZE, offset });
    for (const layout of layouts) {
      const resource = await adapter.getLayoutDSL(layout.id);
      if (resource) append(usages, "layout", layout.id, resource, variantId);
    }
    if (layouts.length < PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const components = await adapter.listComponentsDSL({
      limit: PAGE_SIZE,
      offset,
    });
    for (const component of components) {
      const resource = await adapter.getComponentDSL(component.id);
      if (resource) {
        append(usages, "component", component.id, resource, variantId);
      }
    }
    if (components.length < PAGE_SIZE) break;
  }

  const designSystem = await adapter.getDesignSystem();
  if (designSystem) {
    append(usages, "design-system", "design-system", designSystem, variantId);
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const records = await adapter.listPageLocaleRecords({
      limit: PAGE_SIZE,
      offset,
    });
    for (const record of records) {
      const versions = record.versions.filter((version) =>
        [record.meta.currentVersion, record.meta.publishedVersion].includes(
          version.version,
        ),
      );
      append(
        usages,
        "page-locale",
        `${record.meta.pageId}:${record.meta.locale}`,
        { versions },
        variantId,
      );
    }
    if (records.length < PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const records = await adapter.listLayoutLocaleRecords({
      limit: PAGE_SIZE,
      offset,
    });
    for (const record of records) {
      const versions = record.versions.filter((version) =>
        [record.meta.currentVersion, record.meta.publishedVersion].includes(
          version.version,
        ),
      );
      append(
        usages,
        "layout-locale",
        `${record.meta.layoutId}:${record.meta.locale}`,
        { versions },
        variantId,
      );
    }
    if (records.length < PAGE_SIZE) break;
  }

  return usages;
}

function append(
  usages: ComposerVariantUsage[],
  kind: ComposerVariantUsage["kind"],
  refId: string,
  resource: unknown,
  variantId: string,
): void {
  for (const reference of collectComposerVariantReferences(resource)) {
    if (reference.variantId !== variantId) continue;
    usages.push({ kind, refId, refPath: reference.refPath });
  }
}
