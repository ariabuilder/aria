import { z } from "zod";

const UuidStringSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

export function formatCmsActorDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || UuidStringSchema.safeParse(trimmed).success) {
    return "Unknown user";
  }

  return trimmed;
}
