import {
  CSS_CLASS_NAME_REGEX,
  type CSSRuleValue,
  type CompoundVariant,
  type PseudoVariant,
} from "../../../../lib/schemas/classEditor";
import {
  PSEUDO_PRESET_DEFINITIONS,
  type PseudoState,
} from "../../../../lib/styles/pseudoSelectors";
import {
  type ContextRule,
} from "../../../../lib/styles/universalDesignSystem";
import { validateContextSelector } from "../../../../lib/styles/cssValidation";
import { normalizeCssRuleList } from "../../../../lib/types/classes";
import { parseCssDeclarations } from "./classManagerCss";
import type { DesignImporterClassesMap } from "./designImporter";

const MAX_INPUT_BYTES = 512 * 1024;
const MAX_RULE_BLOCKS = 500;

const FORBIDDEN_SHEET_PATTERNS = [
  /@import\b/i,
  /javascript\s*:/i,
  /expression\s*\(/i,
  /\bbehavior\s*:/i,
  /-moz-binding/i,
] as const;

const SIMPLE_CLASS_SELECTOR_PATTERN =
  /^(\.[a-zA-Z_-][\w-]*)+(?:::[a-zA-Z][\w-]*|:[a-zA-Z][\w-]*)?$/;

const MEDIA_BREAKPOINT_MAP: Array<{ pattern: RegExp; breakpoint: string }> = [
  { pattern: /\(max-width:\s*475px\)/i, breakpoint: "xs" },
  { pattern: /\(max-width:\s*640px\)/i, breakpoint: "sm" },
  { pattern: /\(max-width:\s*768px\)/i, breakpoint: "md" },
  { pattern: /\(max-width:\s*1024px\)/i, breakpoint: "lg" },
  { pattern: /\(max-width:\s*1280px\)/i, breakpoint: "xl" },
];

export interface ClassCssImportWarning {
  section?: "classes" | "contextRules" | "animations";
  message: string;
}

export interface ClassCssImportSkipped {
  selector: string;
  reason: string;
}

export interface ClassCssImportKeyframes {
  [name: string]: {
    steps: Record<string, Record<string, string>>;
  };
}

export interface ClassCssImportResult {
  success: boolean;
  classes: DesignImporterClassesMap;
  contextRules: ContextRule[];
  keyframes: ClassCssImportKeyframes;
  summary: {
    classCount: number;
    contextRuleCount: number;
    keyframeCount: number;
    skippedCount: number;
    variableCount: number;
  };
  warnings: ClassCssImportWarning[];
  skipped: ClassCssImportSkipped[];
  error?: string;
}

export interface ClassCssImportOptions {
  existingClassNames?: readonly string[];
}

interface ParsedRule {
  selector: string;
  body: string;
  breakpoint: string;
  mediaWarning?: string;
}

interface ParsedKeyframes {
  name: string;
  body: string;
}

type CssBlock =
  | { kind: "rule"; prelude: string; body: string }
  | { kind: "keyframes"; name: string; body: string }
  | { kind: "media"; query: string; body: string }
  | { kind: "skipped"; prelude: string; reason: string };

interface SimpleSelectorParts {
  primaryClass: string;
  compoundClasses: string[];
  pseudoState?: PseudoState;
}

interface MutableClassState {
  variants: Map<string, CSSRuleValue[]>;
  pseudoVariants: PseudoVariant[];
  compoundVariants: CompoundVariant[];
}

const PSEUDO_SUFFIX_TO_STATE = new Map<string, PseudoState>(
  PSEUDO_PRESET_DEFINITIONS.map((definition) => [
    definition.suffix,
    definition.id,
  ]),
);

function stripCssComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "");
}

function validateSheetSecurity(input: string): string | null {
  if (input.length > MAX_INPUT_BYTES) {
    return "CSS input exceeds 512KB limit.";
  }

  for (const pattern of FORBIDDEN_SHEET_PATTERNS) {
    if (pattern.test(input)) {
      return "CSS input contains forbidden constructs (@import, javascript:, expression(), etc.).";
    }
  }

  return null;
}

function findMatchingBrace(input: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = openIndex; index < input.length; index += 1) {
    const char = input[index];
    const prev = input[index - 1];

    if (quote) {
      if (char === quote && prev !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractCssBlocks(input: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && /\s/.test(input[index]!)) {
      index += 1;
    }

    if (index >= input.length) {
      break;
    }

    if (input[index] === "}") {
      index += 1;
      continue;
    }

    const atMatch = input.slice(index).match(/^@([a-zA-Z-]+)/);
    if (atMatch) {
      const atRule = atMatch[1]!.toLowerCase();
      const preludeStart = index;
      const openBrace = input.indexOf("{", index);
      if (openBrace === -1) {
        blocks.push({
          kind: "skipped",
          prelude: input.slice(preludeStart).trim(),
          reason: "Unclosed @-rule block",
        });
        break;
      }

      const closeBrace = findMatchingBrace(input, openBrace);
      if (closeBrace === -1) {
        blocks.push({
          kind: "skipped",
          prelude: input.slice(preludeStart, openBrace).trim(),
          reason: "Unclosed @-rule block",
        });
        break;
      }

      const prelude = input.slice(preludeStart, openBrace).trim();
      const body = input.slice(openBrace + 1, closeBrace).trim();

      if (atRule === "keyframes") {
        const nameMatch = prelude.match(/^@keyframes\s+([a-zA-Z_-][\w-]*)/i);
        if (!nameMatch) {
          blocks.push({
            kind: "skipped",
            prelude,
            reason: "Invalid @keyframes name",
          });
        } else {
          blocks.push({
            kind: "keyframes",
            name: nameMatch[1]!,
            body,
          });
        }
      } else if (atRule === "media") {
        const query = prelude.replace(/^@media\s*/i, "").trim();
        blocks.push({ kind: "media", query, body });
      } else {
        blocks.push({
          kind: "skipped",
          prelude,
          reason: `Unsupported @-rule: @${atRule}`,
        });
      }

      index = closeBrace + 1;
      continue;
    }

    const openBrace = input.indexOf("{", index);
    if (openBrace === -1) {
      const remainder = input.slice(index).trim();
      if (remainder) {
        blocks.push({
          kind: "skipped",
          prelude: remainder,
          reason: "Selector without rule block",
        });
      }
      break;
    }

    const prelude = input.slice(index, openBrace).trim();
    const closeBrace = findMatchingBrace(input, openBrace);
    if (closeBrace === -1) {
      blocks.push({
        kind: "skipped",
        prelude,
        reason: "Unclosed rule block",
      });
      break;
    }

    blocks.push({
      kind: "rule",
      prelude,
      body: input.slice(openBrace + 1, closeBrace).trim(),
    });
    index = closeBrace + 1;

    if (blocks.filter((block) => block.kind === "rule" || block.kind === "keyframes" || block.kind === "media").length > MAX_RULE_BLOCKS) {
      throw new Error(`CSS input exceeds ${MAX_RULE_BLOCKS} rule blocks.`);
    }
  }

  return blocks;
}

function flattenBlocks(blocks: readonly CssBlock[]): {
  rules: ParsedRule[];
  keyframes: ParsedKeyframes[];
  skipped: ClassCssImportSkipped[];
  warnings: ClassCssImportWarning[];
} {
  const rules: ParsedRule[] = [];
  const keyframes: ParsedKeyframes[] = [];
  const skipped: ClassCssImportSkipped[] = [];
  const warnings: ClassCssImportWarning[] = [];

  function mapMediaBreakpoint(query: string): { breakpoint: string; warning?: string } {
    for (const entry of MEDIA_BREAKPOINT_MAP) {
      if (entry.pattern.test(query)) {
        return { breakpoint: entry.breakpoint };
      }
    }

    return {
      breakpoint: "base",
      warning: `Unrecognized @media query "${query}" — imported rules at base breakpoint.`,
    };
  }

  function walkMediaBody(query: string, body: string): void {
    const { breakpoint, warning } = mapMediaBreakpoint(query);
    if (warning) {
      warnings.push({ section: "classes", message: warning });
    }

    const innerBlocks = extractCssBlocks(body);
    for (const block of innerBlocks) {
      if (block.kind === "rule") {
        rules.push({
          selector: block.prelude,
          body: block.body,
          breakpoint,
        });
        continue;
      }

      if (block.kind === "keyframes") {
        keyframes.push({ name: block.name, body: block.body });
        continue;
      }

      if (block.kind === "media") {
        walkMediaBody(block.query, block.body);
        continue;
      }

      skipped.push({
        selector: block.prelude,
        reason: block.reason,
      });
    }
  }

  for (const block of blocks) {
    if (block.kind === "rule") {
      rules.push({
        selector: block.prelude,
        body: block.body,
        breakpoint: "base",
      });
      continue;
    }

    if (block.kind === "keyframes") {
      keyframes.push({ name: block.name, body: block.body });
      continue;
    }

    if (block.kind === "media") {
      walkMediaBody(block.query, block.body);
      continue;
    }

    skipped.push({
      selector: block.prelude,
      reason: block.reason,
    });
  }

  return { rules, keyframes, skipped, warnings };
}

function parsePseudoSuffix(suffix: string): PseudoState | null {
  const normalized = suffix.startsWith("::")
    ? suffix
    : suffix.startsWith(":")
      ? suffix
      : `:${suffix}`;
  return PSEUDO_SUFFIX_TO_STATE.get(normalized) ?? null;
}

function parseSimpleClassSelector(selector: string): SimpleSelectorParts | null {
  if (!SIMPLE_CLASS_SELECTOR_PATTERN.test(selector)) {
    return null;
  }

  const classMatches = [...selector.matchAll(/\.([a-zA-Z_-][\w-]*)/g)];
  if (classMatches.length === 0) {
    return null;
  }

  const primaryClass = classMatches[0]![1]!;
  const compoundClasses = classMatches.slice(1).map((match) => match[1]!);

  let pseudoState: PseudoState | undefined;
  const pseudoMatch = selector.match(/(::[\w-]+|:[\w-]+)$/);
  if (pseudoMatch) {
    const parsed = parsePseudoSuffix(pseudoMatch[1]!);
    if (!parsed) {
      return null;
    }
    pseudoState = parsed;
  }

  for (const className of [primaryClass, ...compoundClasses]) {
    if (!CSS_CLASS_NAME_REGEX.test(className)) {
      return null;
    }
  }

  return {
    primaryClass,
    compoundClasses,
    pseudoState,
  };
}

function collectClassNamesFromSelector(selector: string): string[] {
  return [...selector.matchAll(/\.([a-zA-Z_-][\w-]*)/g)]
    .map((match) => match[1]!)
    .filter((name) => CSS_CLASS_NAME_REGEX.test(name));
}

function slugifyContextRuleId(selector: string): string {
  const slug = selector
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `ctx-${slug || "rule"}`;
}

function parseKeyframeSteps(body: string): Record<string, Record<string, string>> {
  const steps: Record<string, Record<string, string>> = {};
  const stepBlocks = extractCssBlocks(body);

  for (const block of stepBlocks) {
    if (block.kind !== "rule") {
      continue;
    }

    const declarations = parseCssDeclarations(block.body);
    const properties = Object.fromEntries(
      declarations.map((rule) => [rule.property, rule.value]),
    );

    for (const stepSelector of block.prelude.split(",").map((part) => part.trim())) {
      if (!stepSelector) {
        continue;
      }
      steps[stepSelector] = {
        ...(steps[stepSelector] ?? {}),
        ...properties,
      };
    }
  }

  return steps;
}

function ensureClassState(
  classes: Map<string, MutableClassState>,
  className: string,
): MutableClassState {
  const existing = classes.get(className);
  if (existing) {
    return existing;
  }

  const created: MutableClassState = {
    variants: new Map(),
    pseudoVariants: [],
    compoundVariants: [],
  };
  classes.set(className, created);
  return created;
}

function mergeRulesIntoSlot(
  current: CSSRuleValue[] | undefined,
  incoming: CSSRuleValue[],
): CSSRuleValue[] {
  return normalizeCssRuleList([...(current ?? []), ...incoming]);
}

function applyRulesToClass(
  classes: Map<string, MutableClassState>,
  parts: SimpleSelectorParts,
  rules: CSSRuleValue[],
  breakpoint: string,
): void {
  const classState = ensureClassState(classes, parts.primaryClass);

  if (parts.compoundClasses.length === 0 && !parts.pseudoState) {
    const current = classState.variants.get(breakpoint) ?? [];
    classState.variants.set(breakpoint, mergeRulesIntoSlot(current, rules));
    return;
  }

  if (parts.compoundClasses.length > 0 && !parts.pseudoState) {
    const existing = classState.compoundVariants.find(
      (variant) =>
        variant.breakpoint === breakpoint &&
        variant.withClasses.join(".") === parts.compoundClasses.join("."),
    );

    if (existing) {
      existing.rules = mergeRulesIntoSlot(existing.rules, rules);
      return;
    }

    classState.compoundVariants.push({
      withClasses: [...parts.compoundClasses],
      breakpoint,
      rules,
    });
    return;
  }

  if (parts.pseudoState && parts.compoundClasses.length === 0) {
    const existing = classState.pseudoVariants.find(
      (variant) =>
        variant.state === parts.pseudoState && variant.breakpoint === breakpoint,
    );

    if (existing) {
      existing.rules = mergeRulesIntoSlot(existing.rules, rules);
      return;
    }

    classState.pseudoVariants.push({
      state: parts.pseudoState,
      breakpoint,
      rules,
    });
    return;
  }

  const existing = classState.compoundVariants.find(
    (variant) =>
      variant.breakpoint === breakpoint &&
      variant.pseudoState === parts.pseudoState &&
      variant.withClasses.join(".") === parts.compoundClasses.join("."),
  );

  if (existing) {
    existing.rules = mergeRulesIntoSlot(existing.rules, rules);
    return;
  }

  classState.compoundVariants.push({
    withClasses: [...parts.compoundClasses],
    breakpoint,
    pseudoState: parts.pseudoState,
    rules,
  });
}

function buildImporterClasses(
  classes: Map<string, MutableClassState>,
): DesignImporterClassesMap {
  const result: DesignImporterClassesMap = {};

  for (const [name, state] of classes) {
    result[name] = {
      id: name,
      name,
      variants: Array.from(state.variants.entries()).map(([breakpoint, rules]) => ({
        breakpoint,
        rules,
      })),
      pseudoVariants: state.pseudoVariants,
      compoundVariants: state.compoundVariants,
    };
  }

  return result;
}

export function parseClassCssImportInput(
  input: string,
  options: ClassCssImportOptions = {},
): ClassCssImportResult {
  const trimmed = stripCssComments(input).trim();
  const emptyResult: ClassCssImportResult = {
    success: false,
    classes: {},
    contextRules: [],
    keyframes: {},
    summary: {
      classCount: 0,
      contextRuleCount: 0,
      keyframeCount: 0,
      skippedCount: 0,
      variableCount: 0,
    },
    warnings: [],
    skipped: [],
    error: "No importable CSS classes, context rules, or animations were found.",
  };

  if (!trimmed) {
    return emptyResult;
  }

  const securityError = validateSheetSecurity(trimmed);
  if (securityError) {
    return { ...emptyResult, error: securityError };
  }

  let blocks: CssBlock[];
  try {
    blocks = extractCssBlocks(trimmed);
  } catch (error) {
    return {
      ...emptyResult,
      error: error instanceof Error ? error.message : "Failed to parse CSS input.",
    };
  }

  const flattened = flattenBlocks(blocks);
  const classBuilders = new Map<string, MutableClassState>();
  const contextRules: ContextRule[] = [];
  const keyframes: ClassCssImportKeyframes = {};
  const skipped = [...flattened.skipped];
  const warnings = [...flattened.warnings];

  const importedClassNames = new Set<string>();

  for (const rule of flattened.rules) {
    for (const className of collectClassNamesFromSelector(rule.selector)) {
      importedClassNames.add(className);
    }
  }

  const semanticClassNames = Array.from(
    new Set([
      ...importedClassNames,
      ...(options.existingClassNames ?? []),
    ]),
  );

  for (const keyframe of flattened.keyframes) {
    try {
      const steps = parseKeyframeSteps(keyframe.body);
      if (Object.keys(steps).length === 0) {
        skipped.push({
          selector: `@keyframes ${keyframe.name}`,
          reason: "No keyframe steps found",
        });
        continue;
      }

      keyframes[keyframe.name] = { steps };
    } catch (error) {
      skipped.push({
        selector: `@keyframes ${keyframe.name}`,
        reason:
          error instanceof Error ? error.message : "Failed to parse keyframes",
      });
    }
  }

  for (const rule of flattened.rules) {
    const selectorList = rule.selector.split(",").map((part) => part.trim()).filter(Boolean);

    for (const selector of selectorList) {
      try {
        const declarations = parseCssDeclarations(rule.body);
        if (declarations.length === 0) {
          skipped.push({
            selector,
            reason: "No declarations found",
          });
          continue;
        }

        const simple = parseSimpleClassSelector(selector);
        if (simple) {
          applyRulesToClass(classBuilders, simple, declarations, rule.breakpoint);
          importedClassNames.add(simple.primaryClass);
          continue;
        }

        const validation = validateContextSelector(selector, semanticClassNames);
        if (!validation.valid) {
          skipped.push({
            selector,
            reason: validation.error ?? "Unsupported selector",
          });
          continue;
        }

        const contextId = slugifyContextRuleId(selector);
        const existing = contextRules.find((entry) => entry.id === contextId);
        if (existing) {
          existing.rules = mergeRulesIntoSlot(existing.rules, declarations);
          if (rule.breakpoint !== "base") {
            existing.breakpoint = rule.breakpoint;
          }
          continue;
        }

        contextRules.push({
          id: contextId,
          selector,
          breakpoint: rule.breakpoint === "base" ? undefined : rule.breakpoint,
          rules: declarations,
        });
      } catch (error) {
        skipped.push({
          selector,
          reason: error instanceof Error ? error.message : "Failed to parse rule",
        });
      }
    }
  }

  const classes = buildImporterClasses(classBuilders);
  const classCount = Object.keys(classes).length;
  const contextRuleCount = contextRules.length;
  const keyframeCount = Object.keys(keyframes).length;
  const skippedCount = skipped.length;

  if (classCount === 0 && contextRuleCount === 0 && keyframeCount === 0) {
    return {
      ...emptyResult,
      skipped,
      warnings,
      summary: {
        classCount: 0,
        contextRuleCount: 0,
        keyframeCount: 0,
        skippedCount,
        variableCount: 0,
      },
      error:
        skippedCount > 0
          ? "No importable CSS found. Check skipped rules for details."
          : emptyResult.error,
    };
  }

  if (skippedCount > 0) {
    warnings.push({
      message: `${skippedCount} rule${skippedCount === 1 ? "" : "s"} could not be imported.`,
    });
  }

  return {
    success: true,
    classes,
    contextRules,
    keyframes,
    summary: {
      classCount,
      contextRuleCount,
      keyframeCount,
      skippedCount,
      variableCount: 0,
    },
    warnings,
    skipped,
  };
}
