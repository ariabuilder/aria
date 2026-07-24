import { z } from "zod";

import {
  createFieldOptionsFromConfig,
  expandPaddingAxisDefaults,
  getTypographyScaleMetrics,
  HEADING_LEVEL_TO_SCALE_STEP,
  type HeadingScaleStepId,
  isNonEmptyGlobalStyleValue,
  pickGlobalStyleField,
  resolveButtonVariantColors,
  resolveButtonVariantKey,
  resolveEffectiveFontFamily,
  resolveEffectiveFontWeight,
  resolveGlobalStyleFieldValue,
  resolveLinkColorForPseudo,
  type GlobalStyleTargetBucket,
  type ResolveGlobalStyleFieldOptions,
  type TokenPreviewOption,
} from "@/features/Design/lib/globalStyleDefaults";
import { getContentHeadingLevel } from "../composables/useContentContract";
import { getButtonVariantOrDefault } from "../../../../lib/blocks/buttonVariants";
import { getNativeTagForRenderableNode } from "../../../../lib/blocks/renderSemantics";
import { normalizeContainerNodeType } from "../../../../lib/blocks/containerTypes";
import type { InspectorPseudoState } from "../../../../lib/schemas/classEditor";
import { InspectorPseudoStateSchema } from "../../../../lib/schemas/classEditor";
import type { TypographyConfig } from "@/features/Design/composables/useTypography";
import type {
  GlobalStyleButtonVariant,
  GlobalStylesConfig,
} from "../../../../lib/styles/universalDesignSystem";
import type { BuilderNode } from "../../../../lib/types/nodes";

export const InspectorCssPropertyKeySchema = z.enum([
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textDecoration",
  "textUnderlineOffset",
  "textWrap",
  "backgroundColor",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "borderRadius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "maxWidth",
]);

export type InspectorCssPropertyKey = z.infer<
  typeof InspectorCssPropertyKeySchema
>;

export type InspectorStyleDefaults = Readonly<
  Partial<Record<InspectorCssPropertyKey, string>>
>;

export const ResolveInspectorGlobalStyleDefaultsInputSchema = z
  .object({
    node: z.custom<BuilderNode>(),
    globalStyles: z.custom<GlobalStylesConfig>(),
    typography: z.custom<TypographyConfig>(),
    pseudo: InspectorPseudoStateSchema,
    tokenPreviewOptions: z.array(
      z.object({ value: z.string(), preview: z.string() }).strict(),
    ),
  })
  .strict();

export type ResolveInspectorGlobalStyleDefaultsInput = z.infer<
  typeof ResolveInspectorGlobalStyleDefaultsInputSchema
>;

export interface ResolvedStyleTargetContext {
  readonly bucket: GlobalStyleTargetBucket | null;
  readonly headingLevel: number | null;
  readonly scaleStepId: HeadingScaleStepId | "base" | null;
  readonly buttonVariant: GlobalStyleButtonVariant;
  readonly buttonDisabled: boolean;
}

const FORM_CONTROL_TAGS = new Set(["input", "textarea", "select"]);

const FORM_CONTROL_NODE_TYPES = new Set(["input", "textarea", "select"]);

function parseHeadingLevelFromTag(tag: string | null): number | null {
  if (!tag) {
    return null;
  }

  const matched = tag
    .trim()
    .toLowerCase()
    .match(/^h([1-6])$/);
  if (!matched) {
    return null;
  }

  const level = Number(matched[1]);
  if (level >= 1 && level <= 6) {
    return level;
  }

  return null;
}

export function resolveStyleTargetContext(
  node: BuilderNode,
): ResolvedStyleTargetContext {
  const nativeTag = getNativeTagForRenderableNode(node)?.toLowerCase() ?? null;
  const nodeType = normalizeContainerNodeType(node.type).toLowerCase();
  const props = node.props ?? {};
  const buttonDisabled = props.disabled === true;
  const buttonVariant = resolveButtonVariantKey(
    getButtonVariantOrDefault(props.variant) as GlobalStyleButtonVariant,
    buttonDisabled,
  );

  if (nodeType === "button") {
    return {
      bucket: "button",
      headingLevel: null,
      scaleStepId: null,
      buttonVariant,
      buttonDisabled,
    };
  }

  if (nodeType === "link") {
    return {
      bucket: "link",
      headingLevel: null,
      scaleStepId: null,
      buttonVariant,
      buttonDisabled,
    };
  }

  const tagHeadingLevel = parseHeadingLevelFromTag(nativeTag);
  if (tagHeadingLevel !== null) {
    const scaleStepId = HEADING_LEVEL_TO_SCALE_STEP[tagHeadingLevel];
    return {
      bucket: "heading",
      headingLevel: tagHeadingLevel,
      scaleStepId,
      buttonVariant,
      buttonDisabled,
    };
  }

  if (nativeTag === "p" || nodeType === "paragraph" || nodeType === "text") {
    return {
      bucket: "body",
      headingLevel: null,
      scaleStepId: "base",
      buttonVariant,
      buttonDisabled,
    };
  }

  if (
    (nativeTag !== null && FORM_CONTROL_TAGS.has(nativeTag)) ||
    FORM_CONTROL_NODE_TYPES.has(nodeType)
  ) {
    return {
      bucket: "input",
      headingLevel: null,
      scaleStepId: null,
      buttonVariant,
      buttonDisabled,
    };
  }

  if (nativeTag === "section" || nodeType === "section") {
    return {
      bucket: "section",
      headingLevel: null,
      scaleStepId: null,
      buttonVariant,
      buttonDisabled,
    };
  }

  if (nativeTag === "span" || nodeType === "span") {
    return {
      bucket: "body",
      headingLevel: null,
      scaleStepId: "base",
      buttonVariant,
      buttonDisabled,
    };
  }

  if (nodeType === "heading") {
    const level = getContentHeadingLevel(node);
    const scaleStepId = HEADING_LEVEL_TO_SCALE_STEP[level];
    return {
      bucket: "heading",
      headingLevel: level,
      scaleStepId,
      buttonVariant,
      buttonDisabled,
    };
  }

  return {
    bucket: null,
    headingLevel: null,
    scaleStepId: null,
    buttonVariant,
    buttonDisabled,
  };
}

function isButtonHoverPseudo(pseudo: InspectorPseudoState): pseudo is "hover" {
  return pseudo === "hover";
}

function isLinkPseudo(
  pseudo: InspectorPseudoState,
): pseudo is "hover" | "visited" {
  return pseudo === "hover" || pseudo === "visited";
}

function assignTypographyDefaults(
  target: Partial<Record<InspectorCssPropertyKey, string>>,
  defaults: GlobalStylesConfig["defaults"],
  typography: TypographyConfig,
  bucket: GlobalStyleTargetBucket,
  fieldOptions: ResolveGlobalStyleFieldOptions,
  scaleStepId: HeadingScaleStepId | "base" | null,
): void {
  const prefix =
    bucket === "body" ? "body" : bucket === "heading" ? "heading" : "body";

  const scaleMetrics =
    scaleStepId !== null
      ? getTypographyScaleMetrics(typography, scaleStepId)
      : bucket === "body"
        ? getTypographyScaleMetrics(typography, "base")
        : null;

  const globalColor = pickGlobalStyleField(defaults, `${prefix}.color`);
  const globalFamily = pickGlobalStyleField(defaults, `${prefix}.fontFamily`);
  const globalWeight = pickGlobalStyleField(defaults, `${prefix}.fontWeight`);
  const globalLineHeight = pickGlobalStyleField(
    defaults,
    `${prefix}.lineHeight`,
  );
  const globalLetterSpacing = pickGlobalStyleField(
    defaults,
    `${prefix}.letterSpacing`,
  );

  target.color = resolveGlobalStyleFieldValue(
    defaults,
    `${prefix}.color`,
    bucket === "body" ? "#0f172a" : "#111111",
    fieldOptions,
  );

  if (bucket === "body" && !isNonEmptyGlobalStyleValue(globalColor)) {
    target.color = resolveGlobalStyleFieldValue(
      defaults,
      "body.color",
      "#0f172a",
      fieldOptions,
    );
  }

  const resolvedFamily = resolveEffectiveFontFamily(globalFamily, typography, {
    bucket,
    scaleStepId:
      scaleStepId && scaleStepId !== "base"
        ? (scaleStepId as HeadingScaleStepId)
        : undefined,
  });
  if (resolvedFamily !== "inherit") {
    target.fontFamily = resolvedFamily;
  }

  target.fontWeight = resolveEffectiveFontWeight(globalWeight, bucket);

  if (bucket === "body") {
    const globalSize = pickGlobalStyleField(defaults, `${prefix}.fontSize`);
    target.fontSize = isNonEmptyGlobalStyleValue(globalSize)
      ? resolveGlobalStyleFieldValue(
          defaults,
          `${prefix}.fontSize`,
          scaleMetrics?.fontSize ?? "16px",
          fieldOptions,
        )
      : (scaleMetrics?.fontSize ?? "16px");
  } else if (scaleMetrics) {
    const globalSize = pickGlobalStyleField(defaults, `${prefix}.fontSize`);
    target.fontSize = isNonEmptyGlobalStyleValue(globalSize)
      ? resolveGlobalStyleFieldValue(
          defaults,
          `${prefix}.fontSize`,
          scaleMetrics.fontSize,
          fieldOptions,
        )
      : scaleMetrics.fontSize;
  }

  target.lineHeight = isNonEmptyGlobalStyleValue(globalLineHeight)
    ? globalLineHeight.trim()
    : (scaleMetrics?.lineHeight ?? "1.5");

  target.letterSpacing = isNonEmptyGlobalStyleValue(globalLetterSpacing)
    ? globalLetterSpacing.trim()
    : (scaleMetrics?.letterSpacing ?? "0");

  if (bucket === "heading") {
    const globalTransform = pickGlobalStyleField(
      defaults,
      "heading.textTransform",
    );
    if (isNonEmptyGlobalStyleValue(globalTransform)) {
      target.textTransform = globalTransform.trim();
    }
  }

  if (bucket === "body") {
    const globalTextWrap = pickGlobalStyleField(defaults, "body.textWrap");
    if (isNonEmptyGlobalStyleValue(globalTextWrap)) {
      target.textWrap = globalTextWrap.trim();
    }

    const globalMaxWidth = pickGlobalStyleField(defaults, "body.maxWidth");
    if (isNonEmptyGlobalStyleValue(globalMaxWidth)) {
      target.maxWidth = resolveGlobalStyleFieldValue(
        defaults,
        "body.maxWidth",
        "32ch",
        fieldOptions,
      );
    }
  }

  if (bucket === "heading") {
    const globalTextWrap = pickGlobalStyleField(defaults, "heading.textWrap");
    if (isNonEmptyGlobalStyleValue(globalTextWrap)) {
      target.textWrap = globalTextWrap.trim();
    }
  }
}

function assignLinkDefaults(
  target: Partial<Record<InspectorCssPropertyKey, string>>,
  config: GlobalStylesConfig,
  pseudo: InspectorPseudoState,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): void {
  const { defaults } = config;
  const bodyColor = resolveGlobalStyleFieldValue(
    defaults,
    "body.color",
    "#0f172a",
    fieldOptions,
  );

  const linkPseudo: "default" | "hover" | "visited" = isLinkPseudo(pseudo)
    ? pseudo
    : "default";

  target.color = resolveLinkColorForPseudo(
    defaults,
    linkPseudo,
    bodyColor,
    fieldOptions,
  );

  target.fontWeight = resolveEffectiveFontWeight(
    pickGlobalStyleField(defaults, "link.fontWeight"),
    "link",
  );

  const decoration = pickGlobalStyleField(defaults, "link.textDecoration");
  if (isNonEmptyGlobalStyleValue(decoration)) {
    target.textDecoration = decoration.trim();
  }

  const underlineOffset = pickGlobalStyleField(
    defaults,
    "link.underlineOffset",
  );
  if (isNonEmptyGlobalStyleValue(underlineOffset)) {
    target.textUnderlineOffset = underlineOffset.trim();
  }
}

function assignButtonDefaults(
  target: Partial<Record<InspectorCssPropertyKey, string>>,
  config: GlobalStylesConfig,
  typography: TypographyConfig,
  context: ResolvedStyleTargetContext,
  pseudo: InspectorPseudoState,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): void {
  const { defaults } = config;
  const buttonPseudo = isButtonHoverPseudo(pseudo) ? "hover" : "default";
  const variantColors = resolveButtonVariantColors(
    defaults,
    context.buttonVariant,
    buttonPseudo,
    fieldOptions,
  );

  target.backgroundColor = variantColors.backgroundColor;
  target.color = variantColors.color;
  target.borderColor = variantColors.borderColor;

  const base = defaults.button.base;
  target.fontFamily = resolveEffectiveFontFamily(base.fontFamily, typography, {
    bucket: "button",
  });
  if (target.fontFamily === "inherit") {
    delete target.fontFamily;
  }

  target.fontSize = isNonEmptyGlobalStyleValue(base.fontSize)
    ? base.fontSize.trim()
    : "14px";
  target.fontWeight = resolveEffectiveFontWeight(base.fontWeight, "button");
  target.lineHeight = isNonEmptyGlobalStyleValue(base.lineHeight)
    ? base.lineHeight.trim()
    : "1.2";
  target.letterSpacing = isNonEmptyGlobalStyleValue(base.letterSpacing)
    ? base.letterSpacing.trim()
    : "0";

  if (isNonEmptyGlobalStyleValue(base.borderRadius)) {
    target.borderRadius = base.borderRadius.trim();
  }

  if (isNonEmptyGlobalStyleValue(base.borderWidth)) {
    target.borderWidth = base.borderWidth.trim();
    target.borderStyle = "solid";
  }

  const padding = expandPaddingAxisDefaults(base.paddingX, base.paddingY);
  target.paddingTop = padding.paddingTop;
  target.paddingRight = padding.paddingRight;
  target.paddingBottom = padding.paddingBottom;
  target.paddingLeft = padding.paddingLeft;
}

function assignInputDefaults(
  target: Partial<Record<InspectorCssPropertyKey, string>>,
  config: GlobalStylesConfig,
  typography: TypographyConfig,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): void {
  const input = config.defaults.input;

  target.backgroundColor = resolveGlobalStyleFieldValue(
    config.defaults,
    "input.backgroundColor",
    "#111111",
    fieldOptions,
  );
  target.color = resolveGlobalStyleFieldValue(
    config.defaults,
    "input.color",
    "#ffffff",
    fieldOptions,
  );
  target.borderColor = resolveGlobalStyleFieldValue(
    config.defaults,
    "input.borderColor",
    "#3f3f46",
    fieldOptions,
  );

  const family = resolveEffectiveFontFamily(input.fontFamily, typography, {
    bucket: "input",
  });
  if (family !== "inherit") {
    target.fontFamily = family;
  }

  target.fontSize = isNonEmptyGlobalStyleValue(input.fontSize)
    ? input.fontSize.trim()
    : "16px";
  target.lineHeight = isNonEmptyGlobalStyleValue(input.lineHeight)
    ? input.lineHeight.trim()
    : "1.4";
  target.fontWeight = resolveEffectiveFontWeight(
    pickGlobalStyleField(config.defaults, "input.fontWeight"),
    "input",
  );

  if (isNonEmptyGlobalStyleValue(input.borderRadius)) {
    target.borderRadius = input.borderRadius.trim();
  }

  target.borderWidth = "1px";
  target.borderStyle = "solid";

  const padding = expandPaddingAxisDefaults(input.paddingX, input.paddingY);
  target.paddingTop = padding.paddingTop;
  target.paddingRight = padding.paddingRight;
  target.paddingBottom = padding.paddingBottom;
  target.paddingLeft = padding.paddingLeft;
}

function assignSectionDefaults(
  target: Partial<Record<InspectorCssPropertyKey, string>>,
  config: GlobalStylesConfig,
  fieldOptions: ResolveGlobalStyleFieldOptions,
): void {
  const section = config.defaults.section;
  const padding = expandPaddingAxisDefaults(
    section.horizontalPadding,
    section.verticalPadding,
  );

  target.paddingTop = padding.paddingTop;
  target.paddingRight = padding.paddingRight;
  target.paddingBottom = padding.paddingBottom;
  target.paddingLeft = padding.paddingLeft;

  if (isNonEmptyGlobalStyleValue(section.sectionGap)) {
    target.gap = resolveGlobalStyleFieldValue(
      config.defaults,
      "section.sectionGap",
      "32px",
      fieldOptions,
    );
  }
}

export function resolveInspectorGlobalStyleDefaults(
  input: ResolveInspectorGlobalStyleDefaultsInput,
): InspectorStyleDefaults {
  const parsed =
    ResolveInspectorGlobalStyleDefaultsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {};
  }

  const { node, globalStyles, typography, pseudo, tokenPreviewOptions } =
    parsed.data;

  const context = resolveStyleTargetContext(node);
  if (context.bucket === null) {
    return {};
  }

  const fieldOptions = createFieldOptionsFromConfig(
    globalStyles,
    tokenPreviewOptions as TokenPreviewOption[],
  );

  const target: Partial<Record<InspectorCssPropertyKey, string>> = {};

  switch (context.bucket) {
    case "body":
      assignTypographyDefaults(
        target,
        globalStyles.defaults,
        typography,
        "body",
        fieldOptions,
        "base",
      );
      break;
    case "heading":
      assignTypographyDefaults(
        target,
        globalStyles.defaults,
        typography,
        context.bucket,
        fieldOptions,
        context.scaleStepId,
      );
      break;
    case "link":
      assignLinkDefaults(target, globalStyles, pseudo, fieldOptions);
      break;
    case "button":
      assignButtonDefaults(
        target,
        globalStyles,
        typography,
        context,
        pseudo,
        fieldOptions,
      );
      break;
    case "input":
      assignInputDefaults(target, globalStyles, typography, fieldOptions);
      break;
    case "section":
      assignSectionDefaults(target, globalStyles, fieldOptions);
      break;
    default: {
      const _exhaustive: never = context.bucket;
      return _exhaustive;
    }
  }

  const result: Partial<Record<InspectorCssPropertyKey, string>> = {};
  for (const [key, value] of Object.entries(target)) {
    const parsedKey = InspectorCssPropertyKeySchema.safeParse(key);
    if (parsedKey.success && typeof value === "string" && value.length > 0) {
      result[parsedKey.data] = value;
    }
  }

  return result as InspectorStyleDefaults;
}

export function resolveInspectorGlobalStyleDefaultForProperty(
  input: ResolveInspectorGlobalStyleDefaultsInput,
  propertyName: string,
): string | undefined {
  const defaults = resolveInspectorGlobalStyleDefaults(input);
  const parsedKey = InspectorCssPropertyKeySchema.safeParse(propertyName);
  if (!parsedKey.success) {
    return undefined;
  }

  return defaults[parsedKey.data];
}

export function compareInspectorGlobalDefaultsAcrossNodes(
  nodes: readonly BuilderNode[],
  buildInput: (node: BuilderNode) => ResolveInspectorGlobalStyleDefaultsInput,
  propertyName: string,
): { value: string | undefined; isMixed: boolean } {
  if (nodes.length === 0) {
    return { value: undefined, isMixed: false };
  }

  const parsedKey = InspectorCssPropertyKeySchema.safeParse(propertyName);
  if (!parsedKey.success) {
    return { value: undefined, isMixed: false };
  }

  const values = nodes.map((node) => {
    const defaults = resolveInspectorGlobalStyleDefaults(buildInput(node));
    return defaults[parsedKey.data];
  });

  const first = values[0];
  for (const next of values.slice(1)) {
    if (next !== first) {
      return { value: undefined, isMixed: true };
    }
  }

  return { value: first, isMixed: false };
}
