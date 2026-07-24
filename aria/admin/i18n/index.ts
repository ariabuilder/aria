import {
  inject,
  ref,
  type App,
  type InjectionKey,
  type Ref,
} from "vue";
import {
  StudioLocaleSchema,
  type StudioLocale,
} from "../../lib/localization/studioLocale";
import {
  getStudioMessage,
  type StudioMessageKey,
  type StudioMessageValues,
} from "./messages";

export type StudioI18n = {
  locale: Ref<StudioLocale>;
  t: (key: StudioMessageKey, values?: StudioMessageValues) => string;
  setLocale: (locale: StudioLocale) => void;
};

const StudioI18nKey: InjectionKey<StudioI18n> = Symbol("aria-studio-i18n");

function applyDocumentLocale(locale: StudioLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
  document.documentElement.dataset.ariaStudioLocale = locale;
}

function createStudioI18nApi(
  initialLocale: StudioLocale,
  syncDocument: boolean,
): StudioI18n {
  const locale = ref<StudioLocale>(initialLocale);
  const api: StudioI18n = {
    locale,
    t(key, values) {
      return getStudioMessage(locale.value, key, values);
    },
    setLocale(nextLocale) {
      locale.value = StudioLocaleSchema.parse(nextLocale);
      if (syncDocument) {
        applyDocumentLocale(locale.value);
      }
    },
  };

  if (syncDocument) {
    applyDocumentLocale(initialLocale);
  }
  return api;
}

export function createStudioI18n(initialLocale: StudioLocale): {
  install: (app: App) => void;
  api: StudioI18n;
} {
  const api = createStudioI18nApi(initialLocale, true);
  return {
    install(app) {
      app.provide(StudioI18nKey, api);
    },
    api,
  };
}

const fallbackStudioI18n = createStudioI18nApi(
  initialStudioLocaleFromDocument(),
  false,
);

export function initialStudioLocaleFromDocument(): StudioLocale {
  if (typeof document === "undefined") return "en";
  const parsed = StudioLocaleSchema.safeParse(
    document.documentElement.dataset.ariaStudioLocale,
  );
  return parsed.success ? parsed.data : "en";
}

export function useStudioI18n(): StudioI18n {
  const i18n = inject(StudioI18nKey);
  return i18n ?? fallbackStudioI18n;
}

export type { StudioMessageKey, StudioMessageValues } from "./messages";
