import { z } from "zod";

const SaveActionDataSchema = z
  .object({
    success: z.literal(true).optional(),
    version: z.string().trim().min(1),
    nonce: z.string().trim().min(1).optional(),
  })
  .strict();

export type SaveActionData = z.infer<typeof SaveActionDataSchema>;

export function parseSaveActionData(
  payload: unknown,
  operation: "page" | "layout" | "component",
): SaveActionData {
  const parsed = SaveActionDataSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(`Invalid ${operation} save response`);
  }

  return parsed.data;
}
