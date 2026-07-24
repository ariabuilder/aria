import type { SelectableComponent } from "@/features/Core";

export const COMPONENT_PICKER_ALL_FILTER = "all" as const;

export type ComponentPickerFilter =
  | typeof COMPONENT_PICKER_ALL_FILTER
  | `group:${string}`;

export interface FilterComponentPickerOptions {
  components: readonly SelectableComponent[];
  activeFilter: ComponentPickerFilter;
  searchQuery: string;
  effectiveAssignments?: Readonly<Record<string, string>>;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getSelectableComponentId(
  component: SelectableComponent,
): string {
  return component.id?.trim() || component.slug?.trim() || component.name.trim();
}

export function filterComponentPickerItems({
  components,
  activeFilter,
  searchQuery,
  effectiveAssignments = {},
}: FilterComponentPickerOptions): SelectableComponent[] {
  const query = normalizeText(searchQuery).toLocaleLowerCase();
  const groupId = activeFilter.startsWith("group:")
    ? activeFilter.slice("group:".length)
    : null;

  return components
    .filter((component) => {
      if (groupId) {
        return effectiveAssignments[getSelectableComponentId(component)] === groupId;
      }

      return true;
    })
    .filter((component) => {
      if (!query) return true;

      return [
        component.id,
        component.slug,
        component.name,
        component.description,
      ]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLocaleLowerCase().includes(query));
    })
    .slice()
    .sort((left, right) =>
      (left.name || getSelectableComponentId(left)).localeCompare(
        right.name || getSelectableComponentId(right),
      ),
    );
}
