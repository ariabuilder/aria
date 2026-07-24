import type { EntryFieldWidth } from "../../../../lib/cms/schemas";

export const CMS_ENTRY_FIELD_WIDTH_OPTIONS = [
  { value: "full", fraction: "1/1", labelKey: "full" },
  { value: "half", fraction: "1/2", labelKey: "half" },
  { value: "third", fraction: "1/3", labelKey: "third" },
  { value: "quarter", fraction: "1/4", labelKey: "quarter" },
] as const satisfies readonly {
  value: EntryFieldWidth;
  fraction: string;
  labelKey: string;
}[];

export function normalizeEntryFieldWidth(
  width: EntryFieldWidth | undefined,
): EntryFieldWidth {
  return width ?? "full";
}

export function getEntryFieldWidthFraction(width: EntryFieldWidth): string {
  return (
    CMS_ENTRY_FIELD_WIDTH_OPTIONS.find((option) => option.value === width)
      ?.fraction ?? "1/1"
  );
}

export function getEntryFieldWidthClass(width: EntryFieldWidth): string {
  switch (width) {
    case "half":
      return "entry-field-width-half";
    case "third":
      return "entry-field-width-third";
    case "quarter":
      return "entry-field-width-quarter";
    case "full":
      return "entry-field-width-full";
  }
}
