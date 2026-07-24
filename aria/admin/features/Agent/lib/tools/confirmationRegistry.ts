import type { ConfirmationCategory } from "../schemas";
import { SERVER_TOOL_NAMES } from "./constants";
import { getServerToolPolicy } from "../policy/toolPolicy";

/**
 * Registry mapping server tool names → confirmation category.
 * Tools NOT listed here execute without confirmation.
 */
export const CONFIRMATION_REGISTRY: Readonly<
  Record<string, ConfirmationCategory>
> = Object.freeze(
  Object.fromEntries(
    SERVER_TOOL_NAMES.flatMap((toolName) => {
      const category = getServerToolPolicy(toolName).confirmationCategory;
      return category ? [[toolName, category] as const] : [];
    }),
  ),
);

export const CONFIRMATION_CATEGORY_LABELS: Record<
  ConfirmationCategory,
  string
> = {
  delete_content:
    "Confirm deletion of content, media, routing, or design resources",
  replace_variables: "Confirm replacing all design variables",
  publish: "Confirm publishing, unpublishing, or archiving content",
  bulk_operation:
    "Confirm a bulk operation that can change many site resources",
} as const satisfies Record<ConfirmationCategory, string>;

/**
 * Returns the confirmation category for a tool, or `null` if the tool
 * does not require confirmation.
 */
export function getConfirmationCategory(
  toolName: string,
): ConfirmationCategory | null {
  return CONFIRMATION_REGISTRY[toolName] ?? null;
}

/**
 * Returns the user-facing label for a confirmation category.
 */
export function getConfirmationCategoryLabel(
  category: ConfirmationCategory,
): string {
  return CONFIRMATION_CATEGORY_LABELS[category];
}
