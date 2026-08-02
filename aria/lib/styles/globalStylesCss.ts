import { camelToKebab } from "../types/classes";
import { serializeFontFamilyValue } from "./fontFamily";
import type { UniversalDesignSystem } from "./universalDesignSystem";

function getNestedTokenValue(
  source: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = source;

  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return null;
    }

    const record = current as Record<string, unknown>;
    if (segment in record) {
      current = record[segment];
      continue;
    }

    const joined = path.slice(path.indexOf(segment)).join("-");
    if (joined in record) {
      current = record[joined];
      break;
    }

    return null;
  }

  if (typeof current === "string" || typeof current === "number") {
    return String(current);
  }

  return null;
}

function resolveGlobalStyleAliasValue(
  designSystem: UniversalDesignSystem,
  sourceType: "token" | "custom",
  sourceKey: string,
  fallback?: string,
): string {
  if (sourceType === "custom") {
    const fallbackClause = fallback?.trim() ? `, ${fallback.trim()}` : "";
    return `var(--${sourceKey}${fallbackClause})`;
  }

  const resolved = getNestedTokenValue(
    designSystem as unknown as Record<string, unknown>,
    sourceKey.split(".").filter(Boolean),
  );

  return resolved ?? fallback?.trim() ?? "";
}

function buildCssRule(
  selector: string,
  declarations: Record<string, string>,
): string {
  const lines = Object.entries(declarations)
    .map(([property, value]) => [property, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([property, value]) => {
      const resolvedValue =
        property === "fontFamily" ? serializeFontFamilyValue(value) : value;
      return `  ${camelToKebab(property)}: ${resolvedValue};`;
    });

  if (lines.length === 0) return "";

  return [selector + " {", ...lines, "}"].join("\n");
}

const ARIA_SECTION_NODE_SELECTOR =
  "[data-aria-type='Section'], [data-aria-type='section']";

const ARIA_SECTION_CONTENT_SELECTOR =
  "[data-aria-type='Section'] > *, [data-aria-type='section'] > *";

const ARIA_CONTAINER_NODE_SELECTOR =
  "[data-aria-type='Container'], [data-aria-type='container']";

export function buildGlobalStylesCss(
  designSystem: UniversalDesignSystem,
): string {
  const sections: string[] = [];
  const { defaults, variables } = designSystem.globalStyles;

  const variableLines = [
    ...Object.entries(variables.custom).map(
      ([key, definition]) => `  --${key}: ${definition.value.trim()};`,
    ),
    ...Object.entries(variables.aliases)
      .map(([key, alias]) => {
        const value = resolveGlobalStyleAliasValue(
          designSystem,
          alias.sourceType,
          alias.sourceKey,
          alias.fallback,
        ).trim();

        return value ? `  --${key}: ${value};` : "";
      })
      .filter(Boolean),
  ].filter((line) => !line.endsWith(": ;"));

  if (variableLines.length > 0) {
    sections.push(
      ["/* Global Style Variables */", ":root {", ...variableLines, "}"].join(
        "\n",
      ),
    );
  }

  const rules = [
    buildCssRule("html", {
      fontSize: defaults.root.fontSize,
      margin: defaults.root.margin,
      padding: defaults.root.padding,
      cursor: defaults.root.cursor,
      caretColor: defaults.root.caretColor,
      scrollBehavior: defaults.root.scrollBehavior,
      outlineColor: defaults.root.outlineColor,
      outlineWidth: defaults.root.outlineWidth,
      outlineStyle: defaults.root.outlineStyle,
      borderColor: defaults.root.borderColor,
      borderRadius: defaults.root.borderRadius,
    }),
    buildCssRule("::selection", {
      color: defaults.root.selectionColor,
      backgroundColor: defaults.root.selectionBackgroundColor,
    }),
    buildCssRule("body", defaults.body as unknown as Record<string, string>),
    buildCssRule(
      "h1, h2, h3, h4, h5, h6",
      defaults.heading as unknown as Record<string, string>,
    ),
    buildCssRule(
      "h4, h5, h6, [data-aria-subheading='true']",
      defaults.subheading as unknown as Record<string, string>,
    ),
    buildCssRule("p", defaults.paragraph as unknown as Record<string, string>),
    buildCssRule("a", {
      color: defaults.link.color,
      textDecoration: defaults.link.textDecoration,
      textUnderlineOffset: defaults.link.underlineOffset,
      fontWeight: defaults.link.fontWeight,
    }),
    buildCssRule("a:hover", {
      color: defaults.link.hoverColor,
    }),
    buildCssRule("a:visited", {
      color: defaults.link.visitedColor,
    }),
    buildCssRule(
      "button, [type='button'], [type='submit'], [type='reset'], .btn, [data-button-variant]",
      {
        fontFamily: defaults.button.base.fontFamily,
        fontSize: defaults.button.base.fontSize,
        fontWeight: defaults.button.base.fontWeight,
        lineHeight: defaults.button.base.lineHeight,
        letterSpacing: defaults.button.base.letterSpacing,
        borderRadius: defaults.button.base.borderRadius,
        paddingInline: defaults.button.base.paddingX,
        paddingBlock: defaults.button.base.paddingY,
        borderWidth: defaults.button.base.borderWidth,
      },
    ),
    ...Object.entries(defaults.button.variants).flatMap(([variant, style]) => [
      buildCssRule(`.btn-${variant}, [data-button-variant='${variant}']`, {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
      }),
      buildCssRule(
        `.btn-${variant}:hover, [data-button-variant='${variant}']:hover`,
        {
          backgroundColor: style.hoverBackgroundColor,
          color: style.hoverColor,
          borderColor: style.hoverBorderColor,
        },
      ),
    ]),
    buildCssRule(
      "input:not([type='checkbox']):not([type='radio']), textarea, select, .input",
      {
        backgroundColor: defaults.input.backgroundColor,
        color: defaults.input.color,
        borderColor: defaults.input.borderColor,
        borderRadius: defaults.input.borderRadius,
        fontFamily: defaults.input.fontFamily,
        fontSize: defaults.input.fontSize,
        lineHeight: defaults.input.lineHeight,
        paddingInline: defaults.input.paddingX,
        paddingBlock: defaults.input.paddingY,
      },
    ),
    buildCssRule(
      "input:not([type='checkbox']):not([type='radio'])::placeholder, textarea::placeholder",
      {
        color: defaults.input.placeholderColor,
      },
    ),
    buildCssRule(
      "input:not([type='checkbox']):not([type='radio']):focus-visible, textarea:focus-visible, select:focus-visible, .input:focus-visible",
      {
        outlineColor: defaults.input.focusRingColor,
        outlineStyle: defaults.input.focusRingColor ? "solid" : "",
        outlineWidth: defaults.input.focusRingColor ? "2px" : "",
        outlineOffset: defaults.input.focusRingColor ? "2px" : "",
      },
    ),
    buildCssRule(ARIA_SECTION_NODE_SELECTOR, {
      paddingInline: defaults.section.horizontalPadding,
      paddingBlock: defaults.section.verticalPadding,
      gap: defaults.section.sectionGap,
      boxSizing: "border-box",
    }),
    buildCssRule(ARIA_SECTION_CONTENT_SELECTOR, {
      maxWidth: defaults.section.contentMaxWidth,
      marginInline: defaults.section.contentMaxWidth ? "auto" : "",
      boxSizing: "border-box",
    }),
    buildCssRule(ARIA_CONTAINER_NODE_SELECTOR, {
      maxWidth: defaults.container.maxWidth,
      width: defaults.container.width,
      boxSizing: "border-box",
    }),
  ].filter(Boolean);

  if (rules.length > 0) {
    sections.push(["/* Global Styles */", ...rules].join("\n\n"));
  }

  return sections.join("\n\n").trim();
}
