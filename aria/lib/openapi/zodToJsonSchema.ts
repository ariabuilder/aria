import { z } from "zod";

export type JsonSchemaObject = Record<string, unknown>;

function normalizeRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("#/$defs/")) return trimmed;
  if (trimmed.startsWith("#/definitions/")) {
    return `#/$defs/${trimmed.slice("#/definitions/".length)}`;
  }
  if (!trimmed.startsWith("#/")) {
    return `#/$defs/${trimmed}`;
  }
  return `#/$defs/${trimmed.slice(2)}`;
}

function normalizeSchemaRefs(schema: JsonSchemaObject): JsonSchemaObject {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) =>
      typeof item === "object" && item !== null
        ? normalizeSchemaRefs(item as JsonSchemaObject)
        : item,
    ) as unknown as JsonSchemaObject;
  }

  const result: Record<string, unknown> = { ...schema };
  if (typeof result.$ref === "string") {
    result.$ref = normalizeRef(result.$ref);
  }
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === "object" && value !== null) {
      result[key] = normalizeSchemaRefs(value as JsonSchemaObject);
    }
  }
  return result;
}

export function zodSchemaToJsonSchema(schema: z.ZodType): JsonSchemaObject {
  return normalizeSchemaRefs(z.toJSONSchema(schema) as JsonSchemaObject);
}
