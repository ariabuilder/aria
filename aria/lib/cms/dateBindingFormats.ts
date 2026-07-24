import { z } from "zod";

export const CmsDateFormatIdSchema = z.enum([
  "medium",
  "long",
  "short",
  "isoDate",
  "isoDateTime",
  "us",
  "eu",
  "monthDay",
  "monthYear",
  "year",
  "relative",
  "raw",
]);

export type CmsDateFormatId = z.infer<typeof CmsDateFormatIdSchema>;

export const DEFAULT_CMS_DATE_FORMAT: CmsDateFormatId = "medium";
export const DEFAULT_CMS_DATETIME_FORMAT: CmsDateFormatId = "medium";

export interface CmsDateFormatOption {
  id: CmsDateFormatId;
  label: string;
  example: string;
}

const SAMPLE_ISO = "2026-07-07T17:13:01.028Z";

export interface CmsBindingFieldTypeLookup {
  path: string;
  type: string;
}

function formatWithIntl(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatIsoDateTime(date: Date): string {
  return `${formatIsoDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function isDateBindingFieldType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized === "date" || normalized === "datetime";
}

export function defaultDateFormatForFieldType(
  type: "date" | "datetime",
): CmsDateFormatId {
  return type === "datetime" ? DEFAULT_CMS_DATETIME_FORMAT : DEFAULT_CMS_DATE_FORMAT;
}

export function resolveCmsBindingFieldOption(
  bindingPath: string | null | undefined,
  fieldOptions: readonly CmsBindingFieldTypeLookup[],
): CmsBindingFieldTypeLookup | null {
  if (!bindingPath) {
    return null;
  }

  return fieldOptions.find((option) => option.path === bindingPath) ?? null;
}

export function inferDateFieldTypeFromBindingPath(
  bindingPath: string | null | undefined,
): "date" | "datetime" | null {
  if (!bindingPath) {
    return null;
  }

  const fieldName = bindingPath.split(".").filter(Boolean).pop()?.toLowerCase();
  if (!fieldName) {
    return null;
  }

  if (
    fieldName === "publishedat" ||
    fieldName === "updatedat" ||
    fieldName === "createdat" ||
    fieldName === "scheduledfor" ||
    fieldName.endsWith("at")
  ) {
    return "datetime";
  }

  if (fieldName === "publisheddate" || fieldName.endsWith("date")) {
    return "date";
  }

  return null;
}

export function resolveCmsBindingFieldType(
  bindingPath: string | null | undefined,
  fieldOptions: readonly CmsBindingFieldTypeLookup[],
): string | null {
  const fromOptions = resolveCmsBindingFieldOption(bindingPath, fieldOptions)?.type;
  if (fromOptions) {
    return fromOptions;
  }

  return inferDateFieldTypeFromBindingPath(bindingPath);
}

export function parseCmsDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCmsDateValue(
  value: unknown,
  formatId: CmsDateFormatId,
  locale = "en-US",
): string {
  if (formatId === "raw") {
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  const date = parseCmsDateValue(value);
  if (!date) {
    return value == null ? "" : String(value);
  }

  switch (formatId) {
    case "medium":
      return formatWithIntl(date, locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "long":
      return formatWithIntl(date, locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "short":
      return formatWithIntl(date, locale, {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      });
    case "isoDate":
      return formatIsoDate(date);
    case "isoDateTime":
      return formatIsoDateTime(date);
    case "us":
      return formatWithIntl(date, locale, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    case "eu":
      return formatWithIntl(date, "de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    case "monthDay":
      return formatWithIntl(date, locale, {
        month: "long",
        day: "numeric",
      });
    case "monthYear":
      return formatWithIntl(date, locale, {
        month: "long",
        year: "numeric",
      });
    case "year":
      return formatWithIntl(date, locale, { year: "numeric" });
    case "relative":
      return formatRelativeDate(date);
    default:
      return formatWithIntl(date, locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
  }
}

export function buildCmsDateFormatOptions(
  locale = "en-US",
): CmsDateFormatOption[] {
  const sampleDate = parseCmsDateValue(SAMPLE_ISO);
  if (!sampleDate) {
    return [];
  }

  const presets: Array<{ id: CmsDateFormatId; label: string }> = [
    { id: "medium", label: "Month Day, Year" },
    { id: "long", label: "Weekday, Month Day, Year" },
    { id: "short", label: "Numeric date" },
    { id: "isoDate", label: "ISO date" },
    { id: "isoDateTime", label: "ISO date and time" },
    { id: "us", label: "US (MM/DD/YYYY)" },
    { id: "eu", label: "European (DD.MM.YYYY)" },
    { id: "monthDay", label: "Month and day" },
    { id: "monthYear", label: "Month and year" },
    { id: "year", label: "Year only" },
    { id: "relative", label: "Relative time" },
    { id: "raw", label: "Raw value" },
  ];

  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    example: formatCmsDateValue(sampleDate, preset.id, locale),
  }));
}

export const CMS_DATE_FORMAT_OPTIONS = buildCmsDateFormatOptions();
