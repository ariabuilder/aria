import { z } from "zod";
import { PageStatusSchema } from "../composables/usePageForm";

export const PageDetailFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(255)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  layout: z.string().optional(),
  status: PageStatusSchema,
  parent: z.string().nullable(),
});

export type PageDetailFormValues = z.infer<typeof PageDetailFormSchema>;

export const PAGE_DETAIL_FORM_INITIAL: PageDetailFormValues = {
  title: "",
  slug: "",
  description: "",
  layout: "",
  status: "draft",
  parent: null,
};
