import { z } from "zod";

export const HeadingLevelSchema = z.coerce.number().int().min(1).max(6);

export const TextValueSchema = z
  .object({
    text: z.string().max(10000).optional(),
    content: z.string().max(10000).optional(),
    label: z.string().max(1000).optional(),
    level: HeadingLevelSchema.optional(),
  })
  .refine(
    (value) =>
      typeof value.text === "string" ||
      typeof value.content === "string" ||
      typeof value.label === "string",
    {
      message: "At least one text field is required.",
    },
  );

export type TextValue = z.infer<typeof TextValueSchema>;
export type HeadingLevel = z.infer<typeof HeadingLevelSchema>;

export const DEFAULT_TEXT: TextValue = {
  text: "",
};
