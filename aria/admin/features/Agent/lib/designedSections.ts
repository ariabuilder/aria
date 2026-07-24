import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  BLOCK_CATALOG,
  type PropField,
} from "./manifest/blockCatalog";
import {
  formatAgentNodeNormalizationIssues,
  normalizeAgentNodeForInsert,
  type AgentNodeNormalizationIssue,
} from "../../../../lib/blocks/agentNodeNormalizer";

type MutableRecord = Record<string, unknown>;

const INTERNAL_NAVIGATION_NODE_TYPES = new Set([
  "nav-items",
  "nav-item",
  "nav-toggle",
]);
const VISIBLE_CONTENT_NODE_TYPES = new Set([
  "heading",
  "text",
  "button",
  "image",
  "video",
  "icon",
  "list",
  "link",
  "svg",
  "code",
]);
const MAX_DESIGNED_SECTION_NODES = 120;
const MAX_DESIGNED_SECTION_DEPTH = 10;

const catalogEntriesByType = new Map(
  Array.from(new Set(BLOCK_CATALOG.map((entry) => entry.type))).map((type) => [
    type,
    BLOCK_CATALOG.filter((entry) => entry.type === type),
  ]),
);

export type DesignedSectionNormalizationResult =
  | { ok: true; node: BuilderNode }
  | { ok: false; issues: AgentNodeNormalizationIssue[] };

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function appendPath(
  path: AgentNodeNormalizationIssue["path"],
  segment: string | number,
): AgentNodeNormalizationIssue["path"] {
  return [...path, segment];
}

function pushLegacyClassIssue(
  issues: AgentNodeNormalizationIssue[],
  path: AgentNodeNormalizationIssue["path"],
): void {
  issues.push({
    path,
    message:
      "Use classNames/customClasses instead of legacy className or class fields.",
  });
}

function collectLegacyClassIssues(
  input: unknown,
  path: AgentNodeNormalizationIssue["path"],
  issues: AgentNodeNormalizationIssue[],
): void {
  if (!isRecord(input)) {
    return;
  }

  if ("className" in input) {
    pushLegacyClassIssue(issues, appendPath(path, "className"));
  }

  if ("class" in input) {
    pushLegacyClassIssue(issues, appendPath(path, "class"));
  }

  if (isRecord(input.props)) {
    if ("className" in input.props) {
      pushLegacyClassIssue(issues, appendPath(appendPath(path, "props"), "className"));
    }
    if ("class" in input.props) {
      pushLegacyClassIssue(issues, appendPath(appendPath(path, "props"), "class"));
    }
  }

  if (Array.isArray(input.children)) {
    input.children.forEach((child, index) => {
      collectLegacyClassIssues(
        child,
        appendPath(appendPath(path, "children"), index),
        issues,
      );
    });
  }
}

function validatePropValue(
  value: unknown,
  field: PropField,
): string | null {
  if (field.type === "string" && typeof value !== "string") {
    return "must be a string";
  }
  if (field.type === "number" && typeof value !== "number") {
    return "must be a number";
  }
  if (field.type === "boolean" && typeof value !== "boolean") {
    return "must be a boolean";
  }
  if (
    field.enum &&
    (typeof value !== "string" || !field.enum.includes(value))
  ) {
    return `must be one of: ${field.enum.join(", ")}`;
  }
  if (typeof value === "number" && field.constraints?.min !== undefined) {
    if (value < field.constraints.min) {
      return `must be at least ${field.constraints.min}`;
    }
  }
  if (typeof value === "number" && field.constraints?.max !== undefined) {
    if (value > field.constraints.max) {
      return `must be at most ${field.constraints.max}`;
    }
  }
  return null;
}

function collectCatalogIssues(
  node: BuilderNode,
  path: AgentNodeNormalizationIssue["path"],
  issues: AgentNodeNormalizationIssue[],
  state: { count: number; hasVisibleContent: boolean },
  depth = 0,
): void {
  state.count += 1;
  if (VISIBLE_CONTENT_NODE_TYPES.has(node.type)) {
    state.hasVisibleContent = true;
  }

  if (depth > MAX_DESIGNED_SECTION_DEPTH) {
    issues.push({
      path,
      message: `Section nesting cannot exceed ${MAX_DESIGNED_SECTION_DEPTH} levels.`,
    });
    return;
  }

  const entries = catalogEntriesByType.get(node.type);
  if (!entries && !INTERNAL_NAVIGATION_NODE_TYPES.has(node.type)) {
    issues.push({
      path: appendPath(path, "type"),
      message: `Unknown canvas element type "${node.type}". Use aria_list_element_types.`,
    });
  }

  if (entries) {
    const fields = Object.assign({}, ...entries.map((entry) => entry.props ?? {})) as Record<
      string,
      PropField
    >;
    for (const [key, field] of Object.entries(fields)) {
      const value = node.props?.[key];
      if (field.required && value === undefined) {
        issues.push({
          path: appendPath(appendPath(path, "props"), key),
          message: "Required element prop is missing.",
        });
        continue;
      }
      if (value !== undefined) {
        const problem = validatePropValue(value, field);
        if (problem) {
          issues.push({
            path: appendPath(appendPath(path, "props"), key),
            message: `Element prop ${problem}.`,
          });
        }
      }
    }

    const allowsChildren = entries.some(
      (entry) => entry.capabilities?.children === true,
    );
    if (!allowsChildren && node.children.length > 0) {
      issues.push({
        path: appendPath(path, "children"),
        message: `Element type "${node.type}" does not accept authored children.`,
      });
    }
  }

  node.children.forEach((child, index) => {
    collectCatalogIssues(
      child,
      appendPath(appendPath(path, "children"), index),
      issues,
      state,
      depth + 1,
    );
  });
}

export function validateDesignedSectionNode(
  node: BuilderNode,
): AgentNodeNormalizationIssue[] {
  const issues: AgentNodeNormalizationIssue[] = [];
  const state = { count: 0, hasVisibleContent: false };
  collectCatalogIssues(node, [], issues, state);

  if (node.children.length === 0) {
    issues.push({
      path: ["children"],
      message: "A designed section cannot be empty.",
    });
  }
  if (!state.hasVisibleContent) {
    issues.push({
      path: ["children"],
      message: "A designed section needs meaningful copy or media.",
    });
  }
  if (state.count > MAX_DESIGNED_SECTION_NODES) {
    issues.push({
      path: [],
      message: `A designed section cannot exceed ${MAX_DESIGNED_SECTION_NODES} nodes.`,
    });
  }

  return issues;
}

export function normalizeDesignedSectionNode(
  input: unknown,
): DesignedSectionNormalizationResult {
  const legacyClassIssues: AgentNodeNormalizationIssue[] = [];
  collectLegacyClassIssues(input, [], legacyClassIssues);
  if (legacyClassIssues.length > 0) {
    return { ok: false, issues: legacyClassIssues };
  }

  const normalized = normalizeAgentNodeForInsert(input);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.node.type.toLowerCase() !== "section") {
    return {
      ok: false,
      issues: [
        {
          path: ["type"],
          message: "Designed sections must use a section root node.",
        },
      ],
    };
  }

  const catalogIssues = validateDesignedSectionNode(normalized.node);
  if (catalogIssues.length > 0) {
    return { ok: false, issues: catalogIssues };
  }

  return { ok: true, node: normalized.node };
}

export function formatDesignedSectionIssues(
  issues: readonly AgentNodeNormalizationIssue[],
): string {
  return formatAgentNodeNormalizationIssues(issues);
}
