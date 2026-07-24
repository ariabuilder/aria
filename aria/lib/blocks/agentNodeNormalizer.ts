import { z } from "zod";
import { generateNodeId } from "../ids/nodeId";
import { BuilderNodeSchema } from "../schemas/nodes";
import type { BuilderNode } from "../types/nodes";

export type AgentNodeNormalizationPath = Array<string | number>;

export interface AgentNodeNormalizationIssue {
  path: AgentNodeNormalizationPath;
  message: string;
}

export type AgentNodeNormalizationResult =
  | { ok: true; node: BuilderNode }
  | { ok: false; issues: AgentNodeNormalizationIssue[] };

export type AgentNodeTreeNormalizationResult =
  | { ok: true; nodes: BuilderNode[] }
  | { ok: false; issues: AgentNodeNormalizationIssue[] };

type MutableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function appendPath(
  path: AgentNodeNormalizationPath,
  segment: string | number,
): AgentNodeNormalizationPath {
  return [...path, segment];
}

function splitClassTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueTokens(tokens: readonly string[]): string[] {
  return Array.from(new Set(tokens));
}

function collectLegacyClassTokens(
  source: MutableRecord,
  props: MutableRecord,
): string[] {
  const tokens: string[] = [];

  for (const value of [source.className, source.class, props.className, props.class]) {
    if (typeof value === "string") {
      tokens.push(...splitClassTokens(value));
    }
  }

  delete source.className;
  delete source.class;
  delete props.className;
  delete props.class;

  return uniqueTokens(tokens);
}

function normalizeElementPropAliases(
  type: string | undefined,
  props: MutableRecord,
): void {
  if (type === "text" && props.content === undefined && typeof props.text === "string") {
    props.content = props.text;
    delete props.text;
  }
  if (
    type === "heading" &&
    props.text === undefined &&
    typeof props.content === "string"
  ) {
    props.text = props.content;
    delete props.content;
  }
  if (type === "code" && props.content === undefined) {
    if (typeof props.code === "string") {
      props.content = props.code;
      delete props.code;
    } else if (typeof props.text === "string") {
      props.content = props.text;
      delete props.text;
    }
  }
}

function normalizeClassNames(
  raw: unknown,
  legacyTokens: readonly string[],
  path: AgentNodeNormalizationPath,
  issues: AgentNodeNormalizationIssue[],
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};

  if (raw !== undefined) {
    if (!isRecord(raw)) {
      issues.push({
        path,
        message: "classNames must be an object keyed by breakpoint or state.",
      });
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (Array.isArray(value)) {
          const invalidIndex = value.findIndex((entry) => typeof entry !== "string");
          if (invalidIndex >= 0) {
            issues.push({
              path: appendPath(appendPath(path, key), invalidIndex),
              message: "classNames entries must be strings.",
            });
            continue;
          }
          normalized[key] = uniqueTokens(value);
          continue;
        }

        if (typeof value === "string") {
          normalized[key] = splitClassTokens(value);
          continue;
        }

        issues.push({
          path: appendPath(path, key),
          message: "classNames values must be arrays of strings.",
        });
      }
    }
  }

  if (legacyTokens.length > 0) {
    normalized.base = uniqueTokens([...(normalized.base ?? []), ...legacyTokens]);
  }

  return normalized;
}

function normalizeCustomClasses(
  raw: unknown,
  path: AgentNodeNormalizationPath,
  issues: AgentNodeNormalizationIssue[],
): string[] {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    issues.push({ path, message: "customClasses must be an array of strings." });
    return [];
  }

  const tokens: string[] = [];
  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "string") {
      issues.push({
        path: appendPath(path, index),
        message: "customClasses entries must be strings.",
      });
      continue;
    }
    if (entry.trim()) {
      tokens.push(entry.trim());
    }
  }

  return uniqueTokens(tokens);
}

function normalizeStyleValue(
  value: unknown,
  path: AgentNodeNormalizationPath,
  issues: AgentNodeNormalizationIssue[],
): Record<string, string> | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return { base: String(value) };
  }

  if (!isRecord(value)) {
    issues.push({
      path,
      message: "Style values must be strings, numbers, or breakpoint objects.",
    });
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [breakpoint, breakpointValue] of Object.entries(value)) {
    if (breakpointValue === undefined) {
      continue;
    }
    if (
      typeof breakpointValue !== "string" &&
      typeof breakpointValue !== "number"
    ) {
      issues.push({
        path: appendPath(path, breakpoint),
        message: "Responsive style values must be strings or numbers.",
      });
      continue;
    }
    normalized[breakpoint] = String(breakpointValue);
  }

  return normalized;
}

function normalizeStyles(
  raw: unknown,
  path: AgentNodeNormalizationPath,
  issues: AgentNodeNormalizationIssue[],
): Record<string, Record<string, string>> {
  if (raw === undefined) {
    return {};
  }

  if (!isRecord(raw)) {
    issues.push({ path, message: "styles must be an object." });
    return {};
  }

  const normalized: Record<string, Record<string, string>> = {};
  for (const [property, value] of Object.entries(raw)) {
    if (value === undefined) {
      continue;
    }

    const nextValue = normalizeStyleValue(
      value,
      appendPath(path, property),
      issues,
    );
    if (nextValue && Object.keys(nextValue).length > 0) {
      normalized[property] = nextValue;
    }
  }

  return normalized;
}

function zodIssuesToNormalizationIssues(
  error: z.ZodError,
): AgentNodeNormalizationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === "symbol" ? segment.toString() : segment,
    ),
    message: issue.message,
  }));
}

function normalizeNodeCandidate(
  input: unknown,
  path: AgentNodeNormalizationPath,
  issues: AgentNodeNormalizationIssue[],
): unknown {
  if (!isRecord(input)) {
    issues.push({ path, message: "Node must be an object." });
    return input;
  }

  const source: MutableRecord = { ...input };
  const rawProps = source.props;
  const props: MutableRecord =
    rawProps === undefined ? {} : isRecord(rawProps) ? { ...rawProps } : {};

  if (rawProps !== undefined && !isRecord(rawProps)) {
    issues.push({
      path: appendPath(path, "props"),
      message: "props must be an object.",
    });
  }

  const normalizedType =
    typeof source.type === "string"
      ? source.type.trim().toLowerCase()
      : undefined;
  normalizeElementPropAliases(normalizedType, props);

  const legacyClassTokens = collectLegacyClassTokens(source, props);
  const children = Array.isArray(source.children)
    ? source.children.map((child, index) =>
        normalizeNodeCandidate(child, appendPath(appendPath(path, "children"), index), issues),
      )
    : [];

  if (source.children !== undefined && !Array.isArray(source.children)) {
    issues.push({
      path: appendPath(path, "children"),
      message: "children must be an array.",
    });
  }

  return {
    ...source,
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : generateNodeId(),
    // Catalog element names are canonical lowercase values. Providers often
    // title-case them ("Section", "Heading", "Image") even after reading the
    // catalog, which otherwise persists nodes the renderer cannot resolve.
    type: normalizedType ?? source.type,
    props,
    classNames: normalizeClassNames(
      source.classNames,
      legacyClassTokens,
      appendPath(path, "classNames"),
      issues,
    ),
    customClasses: normalizeCustomClasses(
      source.customClasses,
      appendPath(path, "customClasses"),
      issues,
    ),
    styles: normalizeStyles(source.styles, appendPath(path, "styles"), issues),
    children,
  };
}

export function normalizeAgentNodeForInsert(
  input: unknown,
): AgentNodeNormalizationResult {
  const issues: AgentNodeNormalizationIssue[] = [];
  const candidate = normalizeNodeCandidate(input, [], issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const parsed = BuilderNodeSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, issues: zodIssuesToNormalizationIssues(parsed.error) };
  }

  return { ok: true, node: parsed.data };
}

export function normalizeAgentNodeTreeForInsert(
  input: readonly unknown[],
): AgentNodeTreeNormalizationResult {
  const nodes: BuilderNode[] = [];
  const issues: AgentNodeNormalizationIssue[] = [];

  for (const [index, node] of input.entries()) {
    const normalized = normalizeAgentNodeForInsert(node);
    if (normalized.ok) {
      nodes.push(normalized.node);
      continue;
    }

    for (const issue of normalized.issues) {
      issues.push({
        path: [index, ...issue.path],
        message: issue.message,
      });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, nodes };
}

export function formatAgentNodeNormalizationIssues(
  issues: readonly AgentNodeNormalizationIssue[],
): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "node";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
