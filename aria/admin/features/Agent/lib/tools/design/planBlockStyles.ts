import {
  PlanBlockStylesInputSchema,
  PlanBlockStylesOutputSchema,
} from "./schemas";
import type { AgentToolResult } from "../../schemas";
import { fetchDesignSystemForTools } from "../content/designSystemForTools";
import type { AgentToolActionContext } from "../types";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";

/**
 * Dry-run only — no mutations.
 * Validates a class creation + block insert plan before the model commits.
 */
export async function ariaPlanBlockStyles(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = PlanBlockStylesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid plan request", parsed.error.issues),
    );
  }

  const { className, rules } = parsed.data;

  // Read current design system to check for existing classes
  const designRead = await fetchDesignSystemForTools(context, "full");
  if (!designRead.ok) {
    return designRead;
  }

  const designData = designRead.data as {
    classes?: Array<{
      name: string;
      variants?: Array<{ breakpoint: string; rules: Record<string, string> }>;
    }>;
  };
  const existingClasses = designData.classes ?? [];

  const existingClass = existingClasses.find((c) => c.name === className);

  const conflicts: Array<{
    existingRule: string;
    proposedRule: string;
    breakpoint: string;
  }> = [];

  if (existingClass) {
    for (const variant of existingClass.variants ?? []) {
      for (const [prop, existingValue] of Object.entries(variant.rules)) {
        if (prop in rules && rules[prop] !== existingValue) {
          conflicts.push({
            existingRule: `${prop}: ${existingValue}`,
            proposedRule: `${prop}: ${rules[prop]}`,
            breakpoint: variant.breakpoint,
          });
        }
      }
    }
  }

  const plan = PlanBlockStylesOutputSchema.parse({
    plan: {
      className,
      needsCreate: existingClass == null && conflicts.length === 0,
      conflicts,
      affectedNodeCount: 0,
      orderedSteps: existingClass
        ? conflicts.length > 0
          ? [
              `Class "${className}" already exists with conflicting rules. Resolve conflicts or choose a different class name.`,
            ]
          : [
              `Class "${className}" already exists. Apply it directly to nodes via aria_apply_class_to_nodes or customClasses on insert.`,
            ]
        : [
            `1. Create class "${className}" with aria_create_class`,
            `2. Insert block(s) with customClasses: ["${className}"]`,
          ],
    },
  });

  return { ok: true, data: plan as unknown as Record<string, unknown> };
}
