import { z } from "zod";
import type {
  AriaEntryRelation,
  FieldSchema,
} from "../../../../lib/cms/schemas";

export const CmsRelationDraftSchema = z.record(
  z.string(),
  z.array(z.string().trim().min(1)),
);
export type CmsRelationDraft = z.infer<typeof CmsRelationDraftSchema>;

export function cmsRelationFields(
  fields: readonly FieldSchema[],
): Array<FieldSchema & { type: "relation" }> {
  return fields.filter(
    (field): field is FieldSchema & { type: "relation" } =>
      field.type === "relation",
  );
}

export function createRelationDraft(
  fields: readonly FieldSchema[],
  relations: readonly AriaEntryRelation[] | undefined,
): CmsRelationDraft {
  const draft: CmsRelationDraft = {};
  const relationFields = cmsRelationFields(fields);

  for (const field of relationFields) {
    draft[field.key] = [];
  }

  for (const relation of relations ?? []) {
    if (!Object.prototype.hasOwnProperty.call(draft, relation.fieldKey)) {
      continue;
    }
    draft[relation.fieldKey]?.push(relation.targetEntryId);
  }

  return CmsRelationDraftSchema.parse(draft);
}

export function buildEntryRelationsFromDraft(
  entryId: string,
  fields: readonly FieldSchema[],
  draft: CmsRelationDraft,
): AriaEntryRelation[] {
  const parsedDraft = CmsRelationDraftSchema.parse(draft);
  const relations: AriaEntryRelation[] = [];

  for (const field of cmsRelationFields(fields)) {
    const seen = new Set<string>();
    const targetIds = parsedDraft[field.key] ?? [];
    for (const targetEntryId of targetIds) {
      if (seen.has(targetEntryId)) {
        continue;
      }
      seen.add(targetEntryId);
      relations.push({
        sourceEntryId: entryId,
        fieldKey: field.key,
        targetEntryId,
        position: relations.filter((relation) => relation.fieldKey === field.key)
          .length,
      });
    }
  }

  return relations;
}
