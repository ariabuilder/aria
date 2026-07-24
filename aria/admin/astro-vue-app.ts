import type { App } from "vue";

import {
  createStudioI18n,
  initialStudioLocaleFromDocument,
} from "./i18n";

/**
 * Installs providers required by Vue components mounted as Astro islands.
 * The main Studio application has its own bootstrap in `main.
 */
export default function setupAstroVueApp(app: App): void {
  app.use(createStudioI18n(initialStudioLocaleFromDocument()));
}
