import { z } from "zod";
import type { CollectionSchema } from "../schemas";
import type { FieldSchema } from "../fieldSchema";

const RESERVED_FIELD_KEYS = new Set([
  "id",
  "slug",
  "status",
  "createdAt",
  "updatedAt",
  "publishedAt",
]);

const MAX_FIELD_DEPTH = 8;

const LinkValueSchema = z
  .object({
    type: z.enum(["page", "entry", "external", "email", "phone", "internal"]),
    url: z.string().optional(),
    pageId: z.string().optional(),
    entryId: z.string().optional(),
    collectionId: z.string().optional(),
    slug: z.string().optional(),
    label: z.string().optional(),
    openInNewTab: z.boolean().optional(),
  })
  .strict();

const ImageValueSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    alt: z.string().optional(),
    caption: z.string().optional(),
  })
  .strict();

const FileValueSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    label: z.string().optional(),
  })
  .strict();

const StructuredTextBlockSchema = z
  .object({
    type: z.string().trim().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
    marks: z.array(z.record(z.string(), z.unknown())).optional(),
    text: z.string().optional(),
  })
  .strict();

export interface CompileCollectionSchemaResult {
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  hash: string;
  errors: string[];
}

export function hashCollectionSchema(schema: CollectionSchema): string {
  const canonical = JSON.stringify(schema);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function validateCollectionSchema(schema: CollectionSchema): string[] {
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  function walkFields(fields: FieldSchema[], path: string, depth: number): void {
    if (depth > MAX_FIELD_DEPTH) {
      errors.push(`${path}: nested fields exceed max depth of ${MAX_FIELD_DEPTH}`);
      return;
    }

    for (const field of fields) {
      const fieldPath = path ? `${path}.${field.key}` : field.key;

      if (!field.key.trim()) {
        errors.push(`${fieldPath}: field key is required`);
        continue;
      }

      if (RESERVED_FIELD_KEYS.has(field.key)) {
        errors.push(`${fieldPath}: "${field.key}" is reserved`);
      }

      if (seenKeys.has(field.key)) {
        errors.push(`${fieldPath}: duplicate field key "${field.key}"`);
      }
      seenKeys.add(field.key);

      if (
        (field.type === "select" || field.type === "multiSelect") &&
        (!field.options || field.options.length === 0)
      ) {
        errors.push(`${fieldPath}: ${field.type} requires options`);
      }

      if (
        (field.type === "reference" || field.type === "relation") &&
        !field.targetCollection?.trim()
      ) {
        errors.push(`${fieldPath}: ${field.type} requires targetCollection`);
      }

      if (
        (field.type === "repeater" || field.type === "object") &&
        (!field.fields || field.fields.length === 0)
      ) {
        errors.push(`${fieldPath}: ${field.type} requires nested fields`);
      }

      if (field.repeaterDisplay && field.type !== "repeater") {
        errors.push(`${fieldPath}: repeaterDisplay is only valid for repeater fields`);
      }

      const repeaterTitleFieldKey = field.repeaterDisplay?.titleFieldKey?.trim();
      if (field.type === "repeater" && repeaterTitleFieldKey) {
        const nestedFieldKeys = new Set((field.fields ?? []).map((item) => item.key));
        if (!nestedFieldKeys.has(repeaterTitleFieldKey)) {
          errors.push(
            `${fieldPath}: repeaterDisplay.titleFieldKey "${repeaterTitleFieldKey}" must match a nested field`,
          );
        }
      }

      if (field.fields && field.fields.length > 0) {
        walkFields(field.fields, fieldPath, depth + 1);
      }
    }
  }

  if (!schema.id.trim()) {
    errors.push("schema.id is required");
  }
  if (!schema.label.trim()) {
    errors.push("schema.label is required");
  }
  if (!Number.isInteger(schema.version) || schema.version < 1) {
    errors.push("schema.version must be a positive integer");
  }

  walkFields(schema.fields, "", 1);
  return errors;
}

function compileField(field: FieldSchema): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case "string":
    case "text":
    case "slug":
      schema = z.string();
      break;
    case "number":
      schema = z.number();
      break;
    case "integer":
      schema = z.int();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "date":
    case "datetime":
      schema = z.string().min(1);
      break;
    case "select":
      schema =
        field.options && field.options.length > 0
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
      break;
    case "multiSelect":
      schema = z.array(z.string());
      break;
    case "color":
    case "icon":
      schema = z.string().trim().min(1);
      break;
    case "image":
      schema = ImageValueSchema;
      break;
    case "file":
      schema = FileValueSchema;
      break;
    case "reference":
      schema = z.string().trim().min(1);
      break;
    case "relation":
      schema = z.never().optional();
      break;
    case "structuredText":
    case "richtext":
      schema = z.array(StructuredTextBlockSchema);
      break;
    case "json":
      schema = z.record(z.string(), z.unknown());
      break;
    case "repeater":
      schema = z.array(
        z
          .object(compileFieldsShape(field.fields ?? []))
          .strict(),
      );
      break;
    case "object":
      schema = z.object(compileFieldsShape(field.fields ?? [])).strict();
      break;
    case "link":
      schema = LinkValueSchema;
      break;
    default: {
      const exhaustive: never = field.type;
      schema = z.unknown();
      void exhaustive;
    }
  }

  if (!field.required) {
    schema = schema.optional();
  }

  return schema;
}

function compileFieldsShape(
  fields: FieldSchema[],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.type === "relation") {
      continue;
    }
    shape[field.key] = compileField(field);
  }
  return shape;
}

export function compileCollectionSchema(
  schema: CollectionSchema,
): CompileCollectionSchemaResult {
  const errors = validateCollectionSchema(schema);
  if (errors.length > 0) {
    return {
      zodSchema: z.object({}).strict(),
      hash: "",
      errors,
    };
  }

  const zodSchema = z.object(compileFieldsShape(schema.fields)).strict();
  return {
    zodSchema,
    hash: hashCollectionSchema(schema),
    errors: [],
  };
}

export function validateEntryFrontmatter(
  schema: CollectionSchema,
  frontmatter: Record<string, unknown>,
  options: { allowMissingRequired?: boolean } = {},
): { success: true } | { success: false; errors: string[] } {
  const compiled = compileCollectionSchema(schema);
  if (compiled.errors.length > 0) {
    return { success: false, errors: compiled.errors };
  }

  const validationSchema = options.allowMissingRequired
    ? compiled.zodSchema.partial()
    : compiled.zodSchema;
  const input = options.allowMissingRequired
    ? Object.fromEntries(
        Object.entries(frontmatter).filter(([, value]) => value !== undefined),
      )
    : frontmatter;
  const result = validationSchema.safeParse(input);
  if (result.success) {
    return { success: true };
  }

  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`,
    ),
  };
}
