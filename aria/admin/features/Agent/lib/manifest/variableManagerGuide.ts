import { z } from "zod";

export const VariableManagerGuide = z
  .object({
    description: z.string(),
    rules: z.array(z.string()),
    example: z.object({
      scenario: z.string(),
      steps: z.array(z.string()),
    }),
  })
  .strict()
  .parse({
    description:
      "CSS variable (custom property) management rules for the AI agent",

    rules: [
      "CSS variable names are stored WITHOUT the -- prefix in globalStyles.variables.custom",
      "Example: CSS var(--card-shadow) is stored as key 'card-shadow' in the custom record",
      "Each variable entry has: { label, value, category, description? }",
      "Existing design tokens (colors, typography sizes, spacing) are automatically exposed as CSS variables — do not re-declare them",
      "Use aria_manage_css_variables to set new variables or remove existing ones",
      "Variable values can reference other variables: 'var(--primary-500)'",
      "Be conservative — only create variables when existing design tokens cannot express the desired value",
    ],

    example: {
      scenario:
        "User: 'Add a --card-shadow variable for consistent box shadows'",
      steps: [
        'Step 1: Call aria_get_design_system(detail:"full") to see existing variables',
        "Step 2: Confirm 'card-shadow' does not exist in globalStyles.variables.custom",
        'Step 3: Call aria_manage_css_variables({ variables: { "card-shadow": "0 4px 12px rgba(0,0,0,0.1)" } })',
      ],
    },
  });

export type VariableManagerGuide = typeof VariableManagerGuide;
