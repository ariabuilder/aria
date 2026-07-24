import type { StudioLocale } from "../../lib/localization/studioLocale";
import {
  EN_ALL_FEATURE_MESSAGES,
  FR_ALL_FEATURE_MESSAGES,
} from "./messages/registry";

export const EN_MESSAGES = {
  ...EN_ALL_FEATURE_MESSAGES,
} as const;

export type StudioMessageKey = keyof typeof EN_MESSAGES;
export type StudioMessageCatalog = Record<StudioMessageKey, string>;
export type StudioMessageValues = Readonly<Record<string, string | number>>;

export const FR_MESSAGES = {
  ...FR_ALL_FEATURE_MESSAGES,
} satisfies StudioMessageCatalog;

export const STUDIO_MESSAGES: Record<StudioLocale, StudioMessageCatalog> = {
  en: EN_MESSAGES,
  fr: FR_MESSAGES,
};

export function getStudioMessage(
  locale: StudioLocale,
  key: StudioMessageKey,
  values?: StudioMessageValues,
): string {
  const template = STUDIO_MESSAGES[locale][key] ?? EN_MESSAGES[key];
  if (!values) return template;
  return template.replace(
    /{{([A-Za-z0-9_]+)}}/g,
    (placeholder, name: string) => {
      const value = values[name];
      return value === undefined ? placeholder : String(value);
    },
  );
}
