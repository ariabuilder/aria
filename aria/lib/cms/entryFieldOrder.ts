import type {
  AriaCollection,
  CollectionSchema,
  EntryFieldOrderItem,
  FieldSchema,
  SystemEntryFieldKey,
} from "./schemas";
import { entryFieldsForCollection } from "./systemFields";

export const SYSTEM_ENTRY_FIELD_KEYS = [
  "title",
  "slug",
  "body",
] as const satisfies readonly SystemEntryFieldKey[];

function itemId(item: EntryFieldOrderItem): string {
  return `${item.kind}:${item.key}`;
}

function defaultEntryFieldOrder(
  fields: readonly FieldSchema[],
  supportsBody: boolean,
): EntryFieldOrderItem[] {
  return [
    { kind: "system", key: "title" },
    { kind: "system", key: "slug" },
    ...fields.map((field) => ({ kind: "field", key: field.key }) as const),
    ...(supportsBody ? ([{ kind: "system", key: "body" }] as const) : []),
  ];
}

function insertMissingDefaultItem(
  result: EntryFieldOrderItem[],
  item: EntryFieldOrderItem,
  defaultIndexById: ReadonlyMap<string, number>,
): void {
  const targetDefaultIndex = defaultIndexById.get(itemId(item)) ?? result.length;
  let insertIndex = result.length;

  for (let index = 0; index < result.length; index += 1) {
    const candidateDefaultIndex = defaultIndexById.get(itemId(result[index]!));
    if (
      candidateDefaultIndex !== undefined &&
      candidateDefaultIndex > targetDefaultIndex
    ) {
      insertIndex = index;
      break;
    }
  }

  result.splice(insertIndex, 0, item);
}

export function normalizeEntryFieldOrder(input: {
  fields: readonly FieldSchema[];
  entryFieldOrder?: readonly EntryFieldOrderItem[];
  supportsBody: boolean;
}): EntryFieldOrderItem[] {
  const fieldsByKey = new Map(input.fields.map((field) => [field.key, field]));
  const defaultOrder = defaultEntryFieldOrder(input.fields, input.supportsBody);
  const defaultIndexById = new Map(
    defaultOrder.map((item, index) => [itemId(item), index] as const),
  );

  if (!input.entryFieldOrder || input.entryFieldOrder.length === 0) {
    return defaultOrder;
  }

  const seen = new Set<string>();
  const result: EntryFieldOrderItem[] = [];

  for (const item of input.entryFieldOrder) {
    const id = itemId(item);
    if (seen.has(id)) {
      continue;
    }

    if (item.kind === "system") {
      if (item.key === "body" && !input.supportsBody) {
        continue;
      }
      result.push(item);
      seen.add(id);
      continue;
    }

    if (fieldsByKey.has(item.key)) {
      result.push(item);
      seen.add(id);
    }
  }

  for (const item of defaultOrder) {
    const id = itemId(item);
    if (!seen.has(id)) {
      insertMissingDefaultItem(result, item, defaultIndexById);
      seen.add(id);
    }
  }

  return result;
}

export function normalizeEntryFieldOrderForCollection(
  collection: AriaCollection,
): EntryFieldOrderItem[] {
  return normalizeEntryFieldOrder({
    fields: entryFieldsForCollection(collection),
    entryFieldOrder: collection.schema.entryFieldOrder,
    supportsBody: collection.supports.includes("body"),
  });
}

export function collectionSchemaWithEntryFieldOrder(
  schema: CollectionSchema,
  entryFieldOrder: readonly EntryFieldOrderItem[],
): CollectionSchema {
  return {
    ...schema,
    entryFieldOrder: [...entryFieldOrder],
  };
}
