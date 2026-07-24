import { z } from "zod";

export const ClassManagerGuide = z
  .object({
    description: z.string(),
    workflow: z.array(z.string()),
    rules: z.array(z.string()),
    example: z.object({
      scenario: z.string(),
      steps: z.array(z.string()),
    }),
  })
  .strict()
  .parse({
    description: "Class-first workflow rules for the AI agent",

    workflow: [
      '1. READ: Before creating a class, always call aria_get_design_system(detail:"full") or aria_list_classes to check if it already exists',
      "2. CHECK: If the class does NOT exist, create it with aria_create_class BEFORE inserting any blocks that reference it",
      "3. HANDLE CONFLICT: If aria_create_class returns CONFLICT (duplicate class name), suggest an alternative name to the user — do not silently overwrite",
      '4. INSERT: Only after the class exists, call insert_nodes with customClasses: ["new-class-name"]',
      "5. APPLY EXISTING: If the class already exists, apply it directly to nodes with aria_apply_class_to_nodes or via customClasses on insert",
    ],

    rules: [
      "Class names must be lowercase letters, digits, hyphens, and underscores: ^[a-z][a-z0-9_-]*$",
      'Define styles per breakpoint in the variants array: { breakpoint: "base", rules: { ... } }',
      "Never create a class that duplicates an existing class's CSS — suggest reusing the existing class instead",
      "When renaming a class, warn the user that existing blocks referencing the old name will NOT update automatically",
      "Prefer customClasses over inline styles for repeatable design patterns",
      "Classes are stored in the design system, not in individual page DSL",
    ],

    example: {
      scenario:
        "User: 'Create a pricing card section using a .pricing-card class'",
      steps: [
        'Step 1: Call aria_get_design_system(detail:"full")',
        'Step 2: Check the output for an existing "pricing-card" class — not found',
        'Step 3: Call aria_create_class({ name: "pricing-card", variants: [{ breakpoint: "base", rules: { padding: "24px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" } }, { breakpoint: "md", rules: { padding: "32px" } }] })',
        'Step 4: Call insert_nodes with the section block, setting customClasses: ["pricing-card"]',
      ],
    },
  });

export type ClassManagerGuide = typeof ClassManagerGuide;
