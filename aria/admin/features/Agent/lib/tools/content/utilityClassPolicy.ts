import { getAdapter } from "../../../../../../actions/_shared";
import { getSiteSettingsUtilityEngine } from "../../../../../../lib/storage/adapter";
import { toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import type { AgentToolResult } from "../../schemas";

function hasValues(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValues);
  if (value && typeof value === "object") {
    return Object.values(value).some(hasValues);
  }
  return false;
}

/** Detects non-empty classNames anywhere in an agent-provided node payload. */
export function containsUtilityClassNames(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsUtilityClassNames);
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (hasValues(record.classNames)) return true;
  return Object.entries(record).some(
    ([key, child]) => key !== "classNames" && containsUtilityClassNames(child),
  );
}

/**
 * Utility classNames are only renderable when the site's Uno engine is
 * active. Keep this guard at the agent-tool boundary so external MCP.
 */
export async function denyUtilityClassesWhenDisabled(
  context: AgentToolActionContext,
  value: unknown,
): Promise<AgentToolResult<never> | null> {
  if (!containsUtilityClassNames(value)) return null;

  const adapter = await getAdapter(toToolActionContext(context));
  if (getSiteSettingsUtilityEngine(await adapter.getSiteSettings()) === "unocss") {
    return null;
  }

  return toolErrorResult({
    code: "INVALID_INPUT",
    message:
      "UnoCSS is disabled for this site, so utility classNames cannot be used. Use customClasses with custom CSS rules instead.",
  });
}
