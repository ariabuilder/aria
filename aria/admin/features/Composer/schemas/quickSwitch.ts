import { z } from "zod";
import { StudioItemTypeSchema } from "@/composables/useComposerAccess";

/** Composer-editable payload shared with stage sidebar load actions. */
export const BuilderQuickSwitchTargetSchema = z
  .object({
    itemType: StudioItemTypeSchema,
    itemId: z.string().trim().min(1),
  })
  .strict();

export const CmsQuickSwitchTargetSchema = z
  .object({
    itemType: z.literal("cms-entry"),
    itemId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    collectionName: z.string().trim().min(1),
    collectionLabel: z.string().trim().min(1),
    title: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    status: z.enum(["draft", "published", "archived"]),
  })
  .strict();

/** Payload accepted by the Composer quick switcher. */
export const QuickSwitchTargetSchema = z.discriminatedUnion("itemType", [
  BuilderQuickSwitchTargetSchema,
  CmsQuickSwitchTargetSchema,
]);

/** Stage load actions can only target Composer-editable documents. */
export const QuickSwitchPayloadSchema = BuilderQuickSwitchTargetSchema;

export type QuickSwitchTarget = z.infer<typeof QuickSwitchTargetSchema>;
export type BuilderQuickSwitchTarget = z.infer<
  typeof BuilderQuickSwitchTargetSchema
>;
export type CmsQuickSwitchTarget = z.infer<typeof CmsQuickSwitchTargetSchema>;

export const SelectablePageSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  status: z.enum(["draft", "published", "scheduled", "archived"]),
  updatedAt: z.string().nullable().optional(),
});

export const SelectableLayoutSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const SelectableComponentSchema = z.object({
  id: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
});

export const SelectableCmsEntrySchema = CmsQuickSwitchTargetSchema.omit({
  itemType: true,
  itemId: true,
}).extend({
  id: z.string().trim().min(1),
});

const BuilderQuickSwitchOptionSchema = z.object({
  itemType: StudioItemTypeSchema,
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  meta: z.string().optional(),
  icon: z.string().trim().min(1),
  keywords: z.string().trim().min(1),
});

const CmsQuickSwitchOptionSchema = z.object({
  itemType: z.literal("cms-entry"),
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  meta: z.string().optional(),
  icon: z.string().trim().min(1),
  keywords: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  collectionName: z.string().trim().min(1),
  collectionLabel: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  locale: z.string().trim().min(1),
  status: z.enum(["draft", "published", "archived"]),
});

export const QuickSwitchOptionSchema = z.union([
  BuilderQuickSwitchOptionSchema,
  CmsQuickSwitchOptionSchema,
]);

export const QuickSwitchGroupSchema = z.object({
  label: z.string().trim().min(1),
  options: z.array(QuickSwitchOptionSchema),
});

export type SelectablePage = z.infer<typeof SelectablePageSchema>;
export type SelectableLayout = z.infer<typeof SelectableLayoutSchema>;
export type SelectableComponent = z.infer<typeof SelectableComponentSchema>;
export type SelectableCmsEntry = z.infer<typeof SelectableCmsEntrySchema>;
export type QuickSwitchOption = z.infer<typeof QuickSwitchOptionSchema>;
export type QuickSwitchGroup = z.infer<typeof QuickSwitchGroupSchema>;

/** URL segment / selection value used for each editable item type in composer. */
export function resolveQuickSwitchValue(
  itemType: BuilderQuickSwitchTarget["itemType"],
  item: SelectablePage | SelectableLayout | SelectableComponent,
): string {
  if (itemType === "page") {
    const page = SelectablePageSchema.parse(item);
    return page.slug;
  }
  if (itemType === "layout") {
    const layout = SelectableLayoutSchema.parse(item);
    return layout.id;
  }
  const component = SelectableComponentSchema.parse(item);
  return component.id ?? component.slug ?? component.name;
}

export function parseQuickSwitchTarget(raw: unknown): QuickSwitchTarget | null {
  const parsed = QuickSwitchTargetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function quickSwitchTargetForOption(
  raw: QuickSwitchOption,
): QuickSwitchTarget {
  const option = QuickSwitchOptionSchema.parse(raw);
  if (option.itemType === "cms-entry") {
    return CmsQuickSwitchTargetSchema.parse({
      itemType: option.itemType,
      itemId: option.value,
      collectionId: option.collectionId,
      collectionName: option.collectionName,
      collectionLabel: option.collectionLabel,
      title: option.label,
      slug: option.slug,
      locale: option.locale,
      status: option.status,
    });
  }
  return BuilderQuickSwitchTargetSchema.parse({
    itemType: option.itemType,
    itemId: option.value,
  });
}
