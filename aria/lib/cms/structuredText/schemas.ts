import { z } from "zod";

export const StructuredTextSpanSchema = z
  .object({
    _type: z.literal("span"),
    _key: z.string().trim().min(1),
    text: z.string(),
    marks: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const StructuredTextMarkDefSchema = z.discriminatedUnion("_type", [
  z
    .object({
      _key: z.string().trim().min(1),
      _type: z.literal("link"),
      href: z.string().trim().min(1),
      openInNewTab: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      _key: z.string().trim().min(1),
      _type: z.literal("entryLink"),
      collectionId: z.string().trim().min(1),
      entryId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      _key: z.string().trim().min(1),
      _type: z.literal("pageLink"),
      pageId: z.string().trim().min(1),
    })
    .strict(),
]);

export const StructuredTextBlockSchema = z.discriminatedUnion("_type", [
  z
    .object({
      _type: z.literal("block"),
      _key: z.string().trim().min(1),
      style: z.enum(["normal", "h2", "h3", "h4", "blockquote"]).default("normal"),
      listItem: z.enum(["bullet", "number"]).optional(),
      level: z.int().positive().optional(),
      markDefs: z.array(StructuredTextMarkDefSchema).default([]),
      children: z.array(StructuredTextSpanSchema).min(1),
    })
    .strict(),
  z
    .object({
      _type: z.literal("image"),
      _key: z.string().trim().min(1),
      mediaId: z.string().trim().min(1),
      alt: z.string().optional(),
      caption: z.array(StructuredTextSpanSchema).optional(),
    })
    .strict(),
  z
    .object({
      _type: z.literal("embed"),
      _key: z.string().trim().min(1),
      provider: z.string().trim().min(1),
      url: z.string().trim().min(1),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  z
    .object({
      _type: z.literal("divider"),
      _key: z.string().trim().min(1),
    })
    .strict(),
]);

export const StructuredTextDocumentSchema = z.array(StructuredTextBlockSchema);

export type StructuredTextSpan = z.infer<typeof StructuredTextSpanSchema>;
export type StructuredTextMarkDef = z.infer<typeof StructuredTextMarkDefSchema>;
export type StructuredTextBlock = z.infer<typeof StructuredTextBlockSchema>;
export type StructuredTextDocument = z.infer<typeof StructuredTextDocumentSchema>;
