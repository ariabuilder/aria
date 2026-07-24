import type { JSONSchema7 } from "ai";
import { z } from "zod";
import {
  ClientToolInsertDesignedSectionInputSchema,
  ClientToolInsertNodesInputSchema,
  ClientToolOpenInComposerInputSchema,
  ClientToolSelectBlockInputSchema,
  ClientToolUpdateNodeMotionInputSchema,
  type AgentComposerMode,
  type AgentSeoContext,
  type AgentShellContext,
} from "./schemas";

export type ClientToolSchema = {
  name: string;
  description?: string;
  parameters?: JSONSchema7;
};

/**
 * Convert a Zod schema to a JSON Schema object with $ref values
 * normalized for Moonshot / Kimi compatibility. Use this when passing schemas.
 */
export function zodSchemaToNormalizedJson(schema: z.ZodType): JSONSchema7 {
  const raw = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    reused: "inline",
  }) as JSONSchema7;
  return normalizeSchemaRefs(raw);
}

function zodSchemaToJson(schema: z.ZodType): JSONSchema7 {
  return zodSchemaToNormalizedJson(schema);
}

/**
 * Recursively walk a JSON Schema tree and fix $ref values so they
 * use the `#/$defs/` prefix expected by Moonshot / Kimi. Zod v4's.
 */
function normalizeSchemaRefs(schema: JSONSchema7): JSONSchema7 {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      typeof item === "object"
        ? normalizeSchemaRefs(item as JSONSchema7)
        : item,
    ) as unknown as JSONSchema7;
  }

  const result: Record<string, unknown> = { ...schema };

  // Fix $ref values
  if (typeof result.$ref === "string") {
    result.$ref = normalizeRef(result.$ref);
  }

  // Recurse into all child properties
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === "object" && val !== null) {
      result[key] = normalizeSchemaRefs(val as JSONSchema7);
    }
  }

  return result as JSONSchema7;
}

function normalizeRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("#/$defs/")) return trimmed;

  // Draft-07 style: #/definitions/Foo → #/$defs/Foo
  if (trimmed.startsWith("#/definitions/")) {
    return "#/$defs/" + trimmed.slice("#/definitions/".length);
  }

  // Bare name (no # prefix): Foo → #/$defs/Foo
  if (!trimmed.startsWith("#/")) {
    return "#/$defs/" + trimmed;
  }

  // Other #/ prefix — replace with #/$defs/
  return "#/$defs/" + trimmed.slice(2);
}

export function buildClientToolSchemas(
  shellContext?: AgentShellContext,
  seoContext?: AgentSeoContext,
  composerMode: AgentComposerMode = "agent",
): ClientToolSchema[] {
  if (seoContext || composerMode === "ask") {
    return [];
  }

  const schemas: ClientToolSchema[] = [];

  if (shellContext?.canClientNavigate) {
    schemas.push({
      name: "open_in_composer",
      description:
        "Open a page, layout, or component in Composer (or Studio detail view). Use before inserting into a document that is not currently open.",
      parameters: zodSchemaToJson(ClientToolOpenInComposerInputSchema),
    });
  }

  if (shellContext?.canClientInsert) {
    schemas.push(
      {
        name: "insert_designed_section",
        description: [
          "Insert exactly one validated root section into the open Composer document.",
          "Aria validates, normalizes, and inserts the supplied node.",
        ].join(" "),
        parameters: zodSchemaToJson(ClientToolInsertDesignedSectionInputSchema),
      },
      {
        name: "insert_nodes",
        description: [
          "Low-level fallback: insert BuilderNode trees into the open composer document.",
          "Requires composer with an open page/layout/component.",
          "Pass nodes as a JSON array, never as a JSON-encoded string. Do not include collection or slug; the browser already owns the open document.",
          "Check aria_list_element_types for per-element prop schemas before constructing nodes.",
          "Check aria_get_node_capabilities for motion/style field schemas.",
          "Utilities use classNames breakpoint arrays, not legacy fields.",
        ].join(" "),
        parameters: zodSchemaToJson(ClientToolInsertNodesInputSchema),
      },
      {
        name: "select_block",
        description: "Select a block on the open canvas by id.",
        parameters: zodSchemaToJson(ClientToolSelectBlockInputSchema),
      },
      {
        name: "update_node_motion",
        description:
          "Apply Aria Motion to an existing block in the open Composer document. If blockId is omitted, uses the selected block. Use for requests like 'add motion to this hero/section' after checking aria_get_node_capabilities.",
        parameters: zodSchemaToJson(ClientToolUpdateNodeMotionInputSchema),
      },
      {
        name: "upload_custom_font",
        description:
          "Upload a custom font file (woff2, woff, ttf, otf) to the site. The browser will open a file picker. Provide optional name, weight, and style.",
        parameters: zodSchemaToJson(
          z.object({
            name: z.string().min(1).max(128).optional(),
            weight: z.string().optional(),
            style: z.string().optional(),
          }),
        ),
      },
    );
  }

  return schemas;
}

/** Alias used by WS request builders. */
export function buildClientToolSchemasForRequest(
  shellContext?: AgentShellContext,
  seoContext?: AgentSeoContext,
  composerMode: AgentComposerMode = "agent",
): ClientToolSchema[] {
  return buildClientToolSchemas(shellContext, seoContext, composerMode);
}
