import { z } from "zod";

import { extractVariableReferenceKey } from "@/lib/variableReferences";
import type {
  TypographyConfig,
  TypeScaleStep,
} from "../composables/useTypography";
import type {
  GlobalStyleButtonVariant,
  GlobalStyleDefaults,
  GlobalStylesConfig,
  GlobalStyleVariables,
} from "../../../../lib/styles/universalDesignSystem";

export const GlobalStyleFieldPathSchema = z.string().min(1);

export const TokenPreviewOptionSchema = z
  .object({
    value: z.string().min(1),
    preview: z.string().min(1),
  })
  .strict();

export type TokenPreviewOption = z.infer<typeof TokenPreviewOptionSchema>;

export const TokenPreviewOptionListSchema = z.array(TokenPreviewOptionSchema);

export const ResolveGlobalStyleFieldOptionsSchema = z
  .object({
    variables: z.custom<GlobalStyleVariables>(),
    tokenPreviewMap: z.map(z.string(), z.string()).optional(),
  })
  .strict();

export type ResolveGlobalStyleFieldOptions = z.infer<
  typeof ResolveGlobalStyleFieldOptionsSchema
>;

export const HeadingScaleStepIdSchema = z.enum([
  "5xl",
  "4xl",
  "3xl",
  "2xl",
  "xl",
  "lg",
]);

export type HeadingScaleStepId = z.infer<typeof HeadingScaleStepIdSchema>;

export const GlobalStyleTargetBucketSchema = z.enum([
  "body",
  "heading",
  "link",
  "button",
  "input",
  "section",
]);

export type GlobalStyleTargetBucket = z.infer<
  typeof GlobalStyleTargetBucketSchema
>;

export const HEADING_LEVEL_TO_SCALE_STEP: Readonly<
  Record<number, HeadingScaleStepId>
> = {
  1: "5xl",
  2: "4xl",
  3: "3xl",
  4: "2xl",
  5: "xl",
  6: "lg",
} as const;

const SEMANTIC_WEIGHT_FALLBACK: Readonly<
  Record<GlobalStyleTargetBucket, string>
> = {
  body: "400",
  heading: "700",
  link: "500",
  button: "600",
  input: "400",
  section: "400",
};

export function formatInspectorMeasurement(value: number, unit = ""): string {
  const normalizedValue = Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "");

  return `${normalizedValue}${unit}`;
}

export function formatScaleFontSize(step: TypeScaleStep): string {
  return formatInspectorMeasurement(step.size, "px");
}

export function formatScaleLineHeight(step: TypeScaleStep): string {
  return formatInspectorMeasurement(step.lineHeight, "px");
}

export function formatScaleLetterSpacing(step: TypeScaleStep): string {
  return formatInspectorMeasurement(step.letterSpacing, "em");
}

export function parseInspectorMeasurement(
  value: string,
): { amount: number; unit: string } | null {
  const matched = value
    .trim()
    .match(/^(-?(?:\d+|\d*\.\d+))(px|rem|em|%|vw|vh|ch)?$/);

  if (!matched) {
    return null;
  }

  return {
    amount: Number(matched[1]),
    unit: matched[2] ?? "",
  };
}

export function isNonEmptyGlobalStyleValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolvePreviewVariableValue(
  variableKey: string,
  variables: GlobalStyleVariables,
  tokenPreviewMap: ReadonlyMap<string, string> | undefined,
  visitedKeys: ReadonlySet<string> = new Set<string>(),
): string | null {
  if (!variableKey || visitedKeys.has(variableKey)) {
    return null;
  }

  const nextVisited = new Set(visitedKeys);
  nextVisited.add(variableKey);

  const customVariable = variables.custom[variableKey];
  if (customVariable) {
    const nestedReferenceKey = extractVariableReferenceKey(
      customVariable.value,
    );

    if (nestedReferenceKey) {
      return resolvePreviewVariableValue(
        nestedReferenceKey,
        variables,
        tokenPreviewMap,
        nextVisited,
      );
    }

    return customVariable.value.trim() || null;
  }

  const alias = variables.aliases[variableKey];
  if (!alias) {
    return null;
  }

  if (alias.sourceType === "token") {
    return (
      tokenPreviewMap?.get(alias.sourceKey) ?? alias.fallback?.trim() ?? null
    );
  }

  const sourceKey = alias.sourceKey.trim();
  if (sourceKey.length > 0) {
    const resolvedSource = resolvePreviewVariableValue(
      sourceKey,
      variables,
      tokenPreviewMap,
      nextVisited,
    );

    if (resolvedSource) {
      return resolvedSource;
    }
  }

  return alias.fallback?.trim() || null;
}

export function resolveGlobalStyleRawValue(
  rawValue: string,
  variables: GlobalStyleVariables,
  tokenPreviewMap?: ReadonlyMap<string, string>,
): string | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const referenceKey = extractVariableReferenceKey(trimmedValue);
  if (!referenceKey) {
    return trimmedValue;
  }

  return resolvePreviewVariableValue(
    referenceKey,
    variables,
    tokenPreviewMap,
    new Set<string>(),
  );
}

export function pickGlobalStyleField(
  defaults: GlobalStyleDefaults,
  path: string,
): string {
  const segments = path.replace(/^defaults\./, "").split(".");
  let current: unknown = defaults;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return "";
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : "";
}

export function resolveGlobalStyleFieldValue(
  defaults: GlobalStyleDefaults,
  path: string,
  fallback: string,
  options: ResolveGlobalStyleFieldOptions,
): string {
  const raw = pickGlobalStyleField(defaults, path);
  if (!isNonEmptyGlobalStyleValue(raw)) {
    return fallback;
  }

  const parsedOptions = ResolveGlobalStyleFieldOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return fallback;
  }

  return (
    resolveGlobalStyleRawValue(
      raw,
      parsedOptions.data.variables,
      parsedOptions.data.tokenPreviewMap,
    ) ?? fallback
  );
}

export function getTypographyScaleStep(
  typography: TypographyConfig,
  stepId: string,
): TypeScaleStep | undefined {
  return typography.scale.find((step) => step.id === stepId);
}

export function getTypographyScaleMetrics(
  typography: TypographyConfig,
  stepId: string,
): { fontSize: string; lineHeight: string; letterSpacing: string } | null {
  const step = getTypographyScaleStep(typography, stepId);
  if (!step) {
    return null;
  }

  return {
    fontSize: formatScaleFontSize(step),
    lineHeight: formatScaleLineHeight(step),
    letterSpacing: formatScaleLetterSpacing(step),
  };
}

export function resolveEffectiveFontFamily(
  globalFamily: string | undefined,
  typography: TypographyConfig,
  options: {
    bucket: GlobalStyleTargetBucket;
    scaleStepId?: HeadingScaleStepId;
  },
): string {
  if (isNonEmptyGlobalStyleValue(globalFamily)) {
    return globalFamily!.trim();
  }

  if (options.scaleStepId && options.bucket === "heading") {
    const override = typography.headingOverrides?.[options.scaleStepId];
    if (override && isNonEmptyGlobalStyleValue(override)) {
      return override.trim();
    }
    if (isNonEmptyGlobalStyleValue(typography.families.heading)) {
      return typography.families.heading.trim();
    }
  }

  if (options.bucket === "body") {
    const bodyStep = getTypographyScaleStep(typography, "base");
    const bodyOverride = typography.bodyOverrides?.["base"];
    if (bodyOverride && isNonEmptyGlobalStyleValue(bodyOverride)) {
      return bodyOverride.trim();
    }
    if (bodyStep && isNonEmptyGlobalStyleValue(typography.families.body)) {
      return typography.families.body.trim();
    }
  }

  if (options.bucket === "button" || options.bucket === "input") {
    if (isNonEmptyGlobalStyleValue(typography.families.body)) {
      return typography.families.body.trim();
    }
  }

  return "inherit";
}

export function resolveEffectiveFontWeight(
  globalWeight: string | undefined,
  bucket: GlobalStyleTargetBucket,
): string {
  if (isNonEmptyGlobalStyleValue(globalWeight)) {
    return globalWeight!.trim();
  }

  return SEMANTIC_WEIGHT_FALLBACK[bucket];
}

export function expandPaddingAxisDefaults(
  paddingX: string,
  paddingY: string,
): Readonly<{
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
}> {
  const x = isNonEmptyGlobalStyleValue(paddingX) ? paddingX.trim() : "0";
  const y = isNonEmptyGlobalStyleValue(paddingY) ? paddingY.trim() : "0";

  return {
    paddingTop: y,
    paddingRight: x,
    paddingBottom: y,
    paddingLeft: x,
  };
}

// LINK COLOR (inherit)

export function resolveLinkColorForPseudo(
  defaults: GlobalStyleDefaults,
  pseudo: "default" | "hover" | "visited",
  bodyColor: string,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): string {
  const pathByPseudo = {
    default: "link.color",
    hover: "link.hoverColor",
    visited: "link.visitedColor",
  } as const;

  const raw = pickGlobalStyleField(defaults, pathByPseudo[pseudo]);
  const resolved = isNonEmptyGlobalStyleValue(raw)
    ? resolveGlobalStyleRawValue(
        raw,
        fieldOptions.variables,
        fieldOptions.tokenPreviewMap,
      )
    : null;

  if (!resolved || resolved.trim().toLowerCase() === "inherit") {
    return bodyColor;
  }

  return resolved;
}

export function resolveButtonVariantKey(
  variant: GlobalStyleButtonVariant,
  disabled: boolean,
): GlobalStyleButtonVariant {
  if (disabled) {
    return "disabled";
  }
  return variant;
}

export type ButtonColorPseudo = "default" | "hover";

export function resolveButtonVariantColors(
  defaults: GlobalStyleDefaults,
  variant: GlobalStyleButtonVariant,
  pseudo: ButtonColorPseudo,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): Readonly<{
  backgroundColor: string;
  color: string;
  borderColor: string;
}> {
  const variantStyle = defaults.button.variants[variant];
  const backgroundPath =
    pseudo === "hover"
      ? `button.variants.${variant}.hoverBackgroundColor`
      : `button.variants.${variant}.backgroundColor`;
  const colorPath =
    pseudo === "hover"
      ? `button.variants.${variant}.hoverColor`
      : `button.variants.${variant}.color`;
  const borderPath =
    pseudo === "hover"
      ? `button.variants.${variant}.hoverBorderColor`
      : `button.variants.${variant}.borderColor`;

  return {
    backgroundColor: resolveGlobalStyleFieldValue(
      defaults,
      backgroundPath,
      variantStyle.backgroundColor || "transparent",
      fieldOptions,
    ),
    color: resolveGlobalStyleFieldValue(
      defaults,
      colorPath,
      variantStyle.color || "#ffffff",
      fieldOptions,
    ),
    borderColor: resolveGlobalStyleFieldValue(
      defaults,
      borderPath,
      variantStyle.borderColor || "transparent",
      fieldOptions,
    ),
  };
}

export function buildTokenPreviewMap(
  options: readonly TokenPreviewOption[],
): Map<string, string> {
  const parsed = TokenPreviewOptionListSchema.safeParse(options);
  if (!parsed.success) {
    return new Map<string, string>();
  }

  return new Map(parsed.data.map((entry) => [entry.value, entry.preview]));
}

export function createFieldOptionsFromConfig(
  config: GlobalStylesConfig,
  tokenPreviewOptions: readonly TokenPreviewOption[] = [],
): ResolveGlobalStyleFieldOptions {
  return {
    variables: config.variables,
    tokenPreviewMap: buildTokenPreviewMap(tokenPreviewOptions),
  };
}
