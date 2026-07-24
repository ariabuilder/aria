import { z } from "zod";

export const DraftEntrySlugSchema = z
  .string()
  .regex(/^untitled-entry-\d{4}-\d{2}-\d{2}-\d{6}$/);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createReadableDraftEntrySlug(date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return DraftEntrySlugSchema.parse(
    `untitled-entry-${year}-${month}-${day}-${hour}${minute}${second}`,
  );
}
