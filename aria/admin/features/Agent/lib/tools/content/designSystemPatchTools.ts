import {
  AriaApplyDesignSystemPatchInputSchema,
  AriaPreviewDesignSystemPatchInputSchema,
  AriaSaveDesignSystemBreakpointsInputSchema,
  AriaSaveDesignSystemColorsInputSchema,
  AriaSaveDesignSystemGlobalStylesInputSchema,
  AriaSaveDesignSystemTypographyInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { createCapabilityRevision } from "../../capabilities/revision";
import { getTokenDb } from "../../mcp/tokenDb";
import {
  toolErrorFromZod,
  toolErrorResult,
  toolSuccessResult,
} from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { fetchDesignSystemForTools } from "./designSystemForTools";
import {
  ariaSaveDesignSystemBreakpoints,
  ariaSaveDesignSystemColors,
  ariaSaveDesignSystemGlobalStyles,
  ariaSaveDesignSystemTypography,
} from "./designSystemWriteTools";

const SECTION_NAMES = [
  "colors",
  "typography",
  "globalStyles",
  "breakpoints",
] as const;
type SectionName = (typeof SECTION_NAMES)[number];
type DesignSections = Record<SectionName, unknown>;

interface DesignPatchPreview {
  baseRevision: string;
  proposedRevision: string;
  changedSections: SectionName[];
  changes: Array<{ path: string; before?: unknown; after?: unknown }>;
  previous: DesignSections;
  proposed: DesignSections;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** RFC 7396-style merge patch: objects merge, arrays/scalars replace, null deletes. */
export function applyDesignMergePatch(
  current: unknown,
  patch: unknown,
): unknown {
  if (!isPlainObject(patch)) return structuredClone(patch);

  const output: Record<string, unknown> = isPlainObject(current)
    ? structuredClone(current)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete output[key];
    } else {
      output[key] = applyDesignMergePatch(output[key], value);
    }
  }
  return output;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectChanges(
  before: unknown,
  after: unknown,
  path: string,
): Array<{ path: string; before?: unknown; after?: unknown }> {
  if (valuesEqual(before, after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
      .sort()
      .flatMap((key) =>
        collectChanges(before[key], after[key], `${path}.${key}`),
      );
  }
  return [{ path, before, after }];
}

function readSections(data: Record<string, unknown>): DesignSections | null {
  if (typeof data.revision !== "string") return null;
  if (!SECTION_NAMES.every((name) => name in data)) return null;
  return Object.fromEntries(
    SECTION_NAMES.map((name) => [name, data[name]]),
  ) as DesignSections;
}

function validateSection(
  name: SectionName,
  value: unknown,
): AgentToolResult<unknown> {
  const schemas = {
    colors: AriaSaveDesignSystemColorsInputSchema,
    typography: AriaSaveDesignSystemTypographyInputSchema,
    globalStyles: AriaSaveDesignSystemGlobalStylesInputSchema,
    breakpoints: AriaSaveDesignSystemBreakpointsInputSchema,
  } as const;
  const parsed = schemas[name].safeParse({ [name]: value });
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod(
        `Invalid proposed design system ${name}`,
        parsed.error.issues,
      ),
    );
  }
  return toolSuccessResult(value);
}

async function preparePreview(
  context: AgentToolActionContext,
  patch: Record<string, unknown>,
  expectedRevision?: string,
): Promise<AgentToolResult<DesignPatchPreview>> {
  const currentRead = await fetchDesignSystemForTools(context, "full");
  if (!currentRead.ok) return currentRead;

  const current = readSections(currentRead.data);
  const baseRevision = currentRead.data.revision;
  if (!current || typeof baseRevision !== "string") {
    return toolErrorResult({
      code: "INTERNAL",
      message:
        "The current design system did not include a save-ready revision.",
    });
  }
  if (expectedRevision && expectedRevision !== baseRevision) {
    return toolErrorResult({
      code: "CONFLICT",
      message: `Design system revision changed (expected ${expectedRevision}, current ${baseRevision}).`,
      suggestedFix:
        "Read aria_get_design_system(detail:full), rebuild the patch against the current revision, and preview again.",
    });
  }

  const proposed = structuredClone(current);
  const changedSections: SectionName[] = [];
  const changes: DesignPatchPreview["changes"] = [];
  for (const name of SECTION_NAMES) {
    if (!(name in patch)) continue;
    const next = applyDesignMergePatch(current[name], patch[name]);
    const validation = validateSection(name, next);
    if (!validation.ok) return validation;
    if (!valuesEqual(current[name], next)) {
      proposed[name] = next;
      changedSections.push(name);
      changes.push(...collectChanges(current[name], next, name));
    }
  }

  return toolSuccessResult({
    baseRevision,
    proposedRevision: await createCapabilityRevision(proposed),
    changedSections,
    changes,
    previous: current,
    proposed,
  });
}

export async function ariaPreviewDesignSystemPatch(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<unknown>> {
  const parsed = AriaPreviewDesignSystemPatchInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  return preparePreview(
    context,
    parsed.data.patch,
    parsed.data.expectedRevision,
  );
}

async function ensureOperationTable(context: AgentToolActionContext) {
  const db = await getTokenDb(context.locals);
  await db.execute(
    `CREATE TABLE IF NOT EXISTS agent_design_operations (
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (actor_id, idempotency_key)
    )`,
  );
  return db;
}

async function runSectionSave(
  context: AgentToolActionContext,
  name: SectionName,
  value: unknown,
) {
  const saves = {
    colors: ariaSaveDesignSystemColors,
    typography: ariaSaveDesignSystemTypography,
    globalStyles: ariaSaveDesignSystemGlobalStyles,
    breakpoints: ariaSaveDesignSystemBreakpoints,
  } as const;
  return saves[name](context, { [name]: value });
}

export async function ariaApplyDesignSystemPatch(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaApplyDesignSystemPatchInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actorId = context.user?.id ?? "service";
  const requestHash = await createCapabilityRevision({
    expectedRevision: parsed.data.expectedRevision,
    patch: parsed.data.patch,
  });
  const db = await ensureOperationTable(context);
  const now = new Date().toISOString();
  const claimed = await db.execute(
    `INSERT OR IGNORE INTO agent_design_operations
      (actor_id, idempotency_key, request_hash, status, result, created_at, updated_at)
      VALUES (?, ?, ?, 'running', NULL, ?, ?)`,
    [actorId, parsed.data.idempotencyKey, requestHash, now, now],
  );

  if (claimed === 0) {
    const existing = await db.queryFirst(
      `SELECT request_hash, status, result FROM agent_design_operations
       WHERE actor_id = ? AND idempotency_key = ?`,
      [actorId, parsed.data.idempotencyKey],
    );
    if (!existing || String(existing.request_hash) !== requestHash) {
      return toolErrorResult({
        code: "CONFLICT",
        message:
          "That idempotency key was already used for a different design operation.",
        suggestedFix:
          "Use a new unique idempotencyKey for the revised operation.",
      });
    }
    if (existing.status === "succeeded" && existing.result) {
      return toolSuccessResult({
        ...JSON.parse(String(existing.result)),
        idempotentReplay: true,
      });
    }
    return toolErrorResult({
      code: "CONFLICT",
      message:
        existing.status === "running"
          ? "This design operation is already running."
          : "This idempotent design operation previously failed.",
      suggestedFix:
        existing.status === "running"
          ? "Wait briefly, then retry with the same idempotencyKey."
          : "Read the current design system and submit a new operation with a new idempotencyKey.",
    });
  }

  const finish = async (status: "succeeded" | "failed", result: unknown) => {
    await db.execute(
      `UPDATE agent_design_operations SET status = ?, result = ?, updated_at = ?
       WHERE actor_id = ? AND idempotency_key = ?`,
      [
        status,
        JSON.stringify(result),
        new Date().toISOString(),
        actorId,
        parsed.data.idempotencyKey,
      ],
    );
  };

  const preview = await preparePreview(
    context,
    parsed.data.patch,
    parsed.data.expectedRevision,
  );
  if (!preview.ok) {
    await finish("failed", preview.error);
    return preview;
  }

  const applied: SectionName[] = [];
  for (const name of preview.data.changedSections) {
    const saved = await runSectionSave(
      context,
      name,
      preview.data.proposed[name],
    );
    if (!saved.ok) {
      const rollbackFailures: SectionName[] = [];
      for (const rollbackName of [...applied].reverse()) {
        const rolledBack = await runSectionSave(
          context,
          rollbackName,
          preview.data.previous[rollbackName],
        );
        if (!rolledBack.ok) rollbackFailures.push(rollbackName);
      }
      const error = {
        ...saved.error,
        message: `${saved.error.message}${rollbackFailures.length ? ` Rollback also failed for: ${rollbackFailures.join(", ")}.` : " Applied sections were rolled back."}`,
      };
      await finish("failed", error);
      return toolErrorResult(error);
    }
    applied.push(name);
  }

  const verified = await fetchDesignSystemForTools(context, "full");
  if (
    !verified.ok ||
    verified.data.revision !== preview.data.proposedRevision
  ) {
    const error = {
      code: "CONFLICT" as const,
      message:
        "Design system write completed but post-write verification did not match the previewed revision.",
      suggestedFix:
        "Read the current design system before making another change; another writer or a storage normalization may have changed it.",
    };
    await finish("failed", error);
    return toolErrorResult(error);
  }

  const result = {
    operationId: `${actorId}:${parsed.data.idempotencyKey}`,
    idempotentReplay: false,
    previousRevision: preview.data.baseRevision,
    revision: preview.data.proposedRevision,
    changedSections: preview.data.changedSections,
    changes: preview.data.changes,
    verified: true,
  };
  await finish("succeeded", result);
  return toolSuccessResult(result);
}
