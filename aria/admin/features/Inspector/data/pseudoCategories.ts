/**
 * Pseudo Categories - Curated pseudo-state presets for the inspector picker
 */

import { z } from "zod";
import { PseudoPresetIdSchema } from "../../../../lib/styles/pseudoSelectors";

export const PseudoCategoryIdSchema = z.enum([
  "states",
  "forms",
  "structure",
  "relational",
  "elements",
]);
export type PseudoCategoryId = z.infer<typeof PseudoCategoryIdSchema>;

export const PseudoCategorySchema = z.object({
  id: PseudoCategoryIdSchema,
  label: z.string().min(1),
  icon: z.string().min(1),
  states: z.array(PseudoPresetIdSchema).min(1),
});
export type PseudoCategory = z.infer<typeof PseudoCategorySchema>;

export const PSEUDO_CATEGORIES = z.array(PseudoCategorySchema).parse([
  {
    id: "states",
    label: "States",
    icon: "MousePointer",
    states: [
      "hover",
      "focus",
      "active",
      "focus-visible",
      "focus-within",
      "visited",
    ],
  },
  {
    id: "forms",
    label: "Forms",
    icon: "FormInput",
    states: [
      "disabled",
      "enabled",
      "checked",
      "indeterminate",
      "required",
      "optional",
      "valid",
      "invalid",
      "read-only",
    ],
  },
  {
    id: "structure",
    label: "Structure",
    icon: "Layers",
    states: [
      "first-child",
      "last-child",
      "only-child",
      "first-of-type",
      "last-of-type",
      "only-of-type",
      "odd",
      "even",
      "empty",
    ],
  },
  {
    id: "relational",
    label: "Relational",
    icon: "Share2",
    states: ["has-any-child", "has-child"],
  },
  {
    id: "elements",
    label: "Elements",
    icon: "Sparkles",
    states: ["before", "after", "placeholder", "selection", "marker", "file"],
  },
]);

export function getPseudoCategoryById(
  id: PseudoCategoryId,
): PseudoCategory | undefined {
  return PSEUDO_CATEGORIES.find((category) => category.id === id);
}
