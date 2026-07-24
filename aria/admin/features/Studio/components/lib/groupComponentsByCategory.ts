import { z } from "zod";
import type { Component } from "@/composables/useBuilderData";

const CategoryLabelSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(1));

const GroupInputItemSchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().optional(),
});

export const UNCATEGORIZED_COMPONENTS_LABEL = "Uncategorized";

export interface ComponentCategoryGroup<TComponent extends Component> {
  key: string;
  label: string;
  items: TComponent[];
}

function normalizeCategoryLabel(value: unknown): string {
  const parsed = CategoryLabelSchema.safeParse(value);
  if (!parsed.success) {
    return UNCATEGORIZED_COMPONENTS_LABEL;
  }
  return parsed.data;
}

function buildGroupKey(label: string): string {
  return label.toLowerCase();
}

export function groupComponentsByCategory<TComponent extends Component>(
  components: readonly TComponent[],
): ComponentCategoryGroup<TComponent>[] {
  const groupsByKey = new Map<string, ComponentCategoryGroup<TComponent>>();

  for (const component of components) {
    const guard = GroupInputItemSchema.safeParse({
      id: component.id,
      category: component.category,
    });
    if (!guard.success) {
      continue;
    }

    const label = normalizeCategoryLabel(guard.data.category);
    const key = buildGroupKey(label);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(component);
      continue;
    }

    groupsByKey.set(key, {
      key,
      label,
      items: [component],
    });
  }

  const groups = [...groupsByKey.values()];
  groups.sort((left, right) => {
    if (left.label === UNCATEGORIZED_COMPONENTS_LABEL) return 1;
    if (right.label === UNCATEGORIZED_COMPONENTS_LABEL) return -1;
    return left.label.localeCompare(right.label);
  });

  for (const group of groups) {
    group.items.sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id),
    );
  }

  return groups;
}
