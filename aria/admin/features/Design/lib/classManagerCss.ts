import { z } from "zod";

import type {
  CSSRuleValue,
  CustomClass,
} from "../../../../lib/schemas/classEditor";
import type { InspectorPseudoState } from "../../../../lib/styles/pseudoSelectors";
import { getPseudoSelectorSuffix } from "../../../../lib/styles/pseudoSelectors";
import {
  formatCssPropertyForEditor,
  normalizeStoredCssProperty,
} from "../../../../lib/types/classes";

export const ClassManagerCssDeclarationSchema = z.object({
  property: z.string().trim().min(1),
  value: z.string().trim().min(1),
  important: z.boolean().default(false),
});

export type ClassManagerCssDeclaration = z.infer<
  typeof ClassManagerCssDeclarationSchema
>;

export interface ClassCssContext {
  breakpoint: string;
  pseudoState: InspectorPseudoState;
}

function assertDeclarationsOnly(cssText: string): void {
  const trimmed = cssText.trim();

  if (!trimmed) {
    return;
  }

  if (/[@{}]/.test(trimmed)) {
    throw new Error("Enter declarations only. Do not include selectors or @-rules.");
  }
}

function parseDeclarationSegment(segment: string): CSSRuleValue {
  const trimmedSegment = segment.trim();
  if (!trimmedSegment) {
    throw new Error("Invalid CSS declaration");
  }

  const separatorIndex = trimmedSegment.indexOf(":");
  if (separatorIndex <= 0) {
    throw new Error(`Invalid CSS declaration: ${trimmedSegment}`);
  }

  const property = trimmedSegment.slice(0, separatorIndex).trim();
  let valuePart = trimmedSegment.slice(separatorIndex + 1).trim();
  let important = false;

  if (/\s!important\s*$/i.test(valuePart)) {
    important = true;
    valuePart = valuePart.replace(/\s!important\s*$/i, "").trim();
  }

  if (!property || !valuePart) {
    throw new Error(`Invalid CSS declaration: ${trimmedSegment}`);
  }

  return ClassManagerCssDeclarationSchema.parse({
    property: normalizeStoredCssProperty(property),
    value: valuePart,
    important,
  });
}

export function parseCssDeclarations(cssText: string): CSSRuleValue[] {
  const declarations: CSSRuleValue[] = [];

  for (const segment of cssText.split(";")) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) {
      continue;
    }

    declarations.push(parseDeclarationSegment(trimmedSegment));
  }

  return declarations;
}

export function parseClassManagerCssText(cssText: string): CSSRuleValue[] {
  assertDeclarationsOnly(cssText);
  return parseCssDeclarations(cssText);
}

function formatRules(rules: CSSRuleValue[]): string {
  return rules
    .map(
      (rule) =>
        `${formatCssPropertyForEditor(rule.property)}: ${rule.value}${rule.important ? " !important" : ""};`,
    )
    .join("\n");
}

function getVariantRules(
  classDefinition: CustomClass,
  context: ClassCssContext,
): CSSRuleValue[] {
  if (context.pseudoState === "default") {
    return (
      classDefinition.variants.find(
        (variant) => variant.breakpoint === context.breakpoint,
      )?.rules ?? []
    );
  }

  return (
    classDefinition.pseudoVariants.find(
      (variant) =>
        variant.state === context.pseudoState &&
        variant.breakpoint === context.breakpoint,
    )?.rules ?? []
  );
}

export function formatClassCssText(
  classDefinition: CustomClass,
  context: ClassCssContext,
): string {
  return formatRules(getVariantRules(classDefinition, context));
}

export function formatClassManagerCssText(
  classDefinition: CustomClass,
  breakpoint: string,
): string {
  return formatClassCssText(classDefinition, {
    breakpoint,
    pseudoState: "default",
  });
}

export function buildClassSelectorPreview(
  className: string,
  pseudoState: InspectorPseudoState,
): string {
  if (pseudoState === "default") {
    return `.${className}`;
  }

  return `.${className}${getPseudoSelectorSuffix(pseudoState)}`;
}
