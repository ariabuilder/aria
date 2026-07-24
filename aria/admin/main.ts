/*
 * Aria Builder
 *
 * Mounts at route /aria
 */

import {
  createApp,
  type ComponentInternalInstance,
  type ComponentPublicInstance,
  type Plugin,
} from "vue";
import { createRouter, createWebHistory } from "vue-router";
// @ts-ignore - Vue SFC typing handled via global.d.ts
import App from "./App.vue";
import { studioRoutes } from "./features/Studio/router";
// Global stylesheets are emitted as <link> tags by aria/pages/admin.astro
// (its side-effect imports run during SSR). Importing them again here would
// duplicate entries in the Vite manifest and grow the main entry's module
// graph for no runtime benefit.
import { log } from "@/lib/utils/logger";
import {
  createStudioI18n,
  initialStudioLocaleFromDocument,
} from "@/i18n";

const baseConsole: Console = {
  ...console,
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

(globalThis as unknown as { __ariaConsole?: Console }).__ariaConsole =
  baseConsole;

(globalThis as unknown as { __ariaLog?: typeof log }).__ariaLog = log;

console.error = (...args: unknown[]) => {
  const message = args.map((arg) => {
    if (arg instanceof Error) return arg.message;
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });

  log("error", message.join(" "), { args });

  if (import.meta.env.DEV) {
    baseConsole.error(...args);
  }
};

const router = createRouter({
  history: createWebHistory("/admin"),
  routes: studioRoutes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  document.title = `${(to.meta.title as string) ?? "Studio"} - Aria`;
});

const app = createApp(App);
const studioI18n = createStudioI18n(initialStudioLocaleFromDocument());

function componentDebugName(
  instance: ComponentPublicInstance | null,
): string {
  const internal = instance as ComponentInternalInstance | null;
  const componentType = internal?.type;
  if (!componentType) {
    return "Unknown";
  }

  if (typeof componentType === "string") {
    return componentType;
  }

  return (
    componentType.__name ||
    (typeof componentType.name === "string" ? componentType.name : undefined) ||
    "Unknown"
  );
}

function componentDebugProps(instance: ComponentPublicInstance | null): string | undefined {
  const props = (instance as ComponentInternalInstance | null)?.props;
  if (!props || typeof props !== "object") {
    return undefined;
  }

  try {
    return JSON.stringify(props).slice(0, 200);
  } catch {
    return undefined;
  }
}

app.config.errorHandler = (err, instance, info) => {
  const componentName = componentDebugName(instance);

  log(
    "error",
    `[Vue errorHandler] ${info || "unknown"} in <${componentName}>`,
    {
      error: err instanceof Error ? err.message : String(err),
      component: componentName,
      info,
      props: componentDebugProps(instance),
    },
  );

  if (import.meta.env.DEV) {
    baseConsole.error(`[Vue errorHandler] ${info} in <${componentName}>`, err);
  }
};

app.config.warnHandler = (msg, instance, trace) => {
  const componentName = componentDebugName(instance);

  log("warn", `[Vue warnHandler] in <${componentName}>: ${msg}`, {
    component: componentName,
    trace: trace ? trace.slice(0, 300) : undefined,
  });

  if (import.meta.env.DEV) {
    baseConsole.warn(`[Vue warnHandler] in <${componentName}>`, msg, trace);
  }
};

app.use(router as unknown as Plugin);
app.use(studioI18n);

// Catch mount-time errors for diagnosis
try {
  app.mount("#app");
} catch (mountErr) {
  log("error", "[app.mount] threw synchronously", {
    error: mountErr instanceof Error ? mountErr.message : String(mountErr),
    stack:
      mountErr instanceof Error ? mountErr.stack?.slice(0, 500) : undefined,
  });
}

// Register the page-thumbnail service worker after the app has mounted so we
// don't compete with the critical render path. The SW caches successful GETs
// to /admin/api/page-thumbnails/* across sessions — the URLs are content-
// addressed (`updatedAt` + `styleRevision`) so cache-first is safe.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const register = () => {
    navigator.serviceWorker
      .register("/admin/sw-thumbnails.js", { scope: "/admin/" })
      .catch((error: unknown) => {
        log("warn", "[sw-thumbnails] registration failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
