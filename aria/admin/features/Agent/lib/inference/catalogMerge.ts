import type { CatalogModel } from "../schemas";

export function mergeCatalogModels(
  primary: CatalogModel[],
  secondary: CatalogModel[],
): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();

  for (const model of secondary) {
    byId.set(model.id, model);
  }

  for (const model of primary) {
    byId.set(model.id, model);
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
