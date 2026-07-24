import type { StudioLocale } from "../../../../lib/localization/studioLocale";

export const EN_AUTH_DOCUMENT_TITLE_MESSAGES = {
  "auth.login.documentTitle": "Aria Builder",
  "auth.setup.documentTitle": "Aria Builder Setup",
  "auth.forgot.documentTitle": "Forgot Password - Aria Builder",
  "auth.reset.documentTitle": "Reset Password - Aria Builder",
} as const;

export type AuthDocumentTitleKey = keyof typeof EN_AUTH_DOCUMENT_TITLE_MESSAGES;

export const FR_AUTH_DOCUMENT_TITLE_MESSAGES = {
  "auth.login.documentTitle": "Aria Builder",
  "auth.setup.documentTitle": "Configuration d'Aria Builder",
  "auth.forgot.documentTitle": "Mot de passe oublié - Aria Builder",
  "auth.reset.documentTitle": "Réinitialiser le mot de passe - Aria Builder",
} satisfies Record<AuthDocumentTitleKey, string>;

const AUTH_DOCUMENT_TITLE_MESSAGES: Record<
  StudioLocale,
  Record<AuthDocumentTitleKey, string>
> = {
  en: EN_AUTH_DOCUMENT_TITLE_MESSAGES,
  fr: FR_AUTH_DOCUMENT_TITLE_MESSAGES,
};

export function getAuthDocumentTitle(
  locale: StudioLocale,
  key: AuthDocumentTitleKey,
): string {
  return AUTH_DOCUMENT_TITLE_MESSAGES[locale][key];
}
