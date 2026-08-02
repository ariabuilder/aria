// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/astro";
import { aria } from "./aria/integration.ts";
import { resolveWranglerConfigPath } from "./aria/lib/storage/wrangler-config.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MEDIA_UPLOAD_ACTION_BODY_MAX_BYTES } from "./aria/lib/media/uploadLimits";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(workspaceRoot, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const version = process.env.PUBLIC_APP_VERSION || pkg.version || "0.0.0";
const runtimeTarget =
  process.env.ARIA_RUNTIME === "node" ? "node" : "cloudflare";
const useNodeRuntime = runtimeTarget === "node";
// A private wrangler.toml (gitignored, real account IDs) takes precedence
// over the committed wrangler.jsonc (OSS placeholder IDs).
const resolvedCloudflareConfigPath = resolveWranglerConfigPath(workspaceRoot);
const cloudflareConfigPath = resolvedCloudflareConfigPath
  ? path.relative(workspaceRoot, resolvedCloudflareConfigPath)
  : "wrangler.jsonc";

/** Reads an installed package version for build-time metadata. */
function readPackageVersion(packageName: string): string {
  const packageJsonPath = path.join(
    workspaceRoot,
    "node_modules",
    ...packageName.split("/"),
    "package.json",
  );

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      version?: string;
    };
    return packageJson.version ?? "unknown";
  } catch {
    return (
      pkg.dependencies?.[packageName] ??
      pkg.devDependencies?.[packageName] ??
      "unknown"
    );
  }
}

const astroVersion = readPackageVersion("astro");
const astroMajor = Number.parseInt(astroVersion.split(".")[0] ?? "", 10);

const SSR_EXTERNALS = [
  "better-sqlite3",
  "node:crypto",
  "crypto",
  "node:fs/promises",
  "fs/promises",
  "node:path",
  "path",
];

const BUILD_EXTERNALS = [
  // Optional browser/WASI fallback pulled in by UnoCSS parser tooling.
  // This is build-time infrastructure, not a runtime dependency of the worker.
  "@oxc-parser/binding-wasm32-wasi",
];

/** Bundled for Cloudflare SSR so UnoCSS preview compile does not hit bare `require`. */
const UNOCSS_SSR_BUNDLE = [
  "unocss",
  "@unocss/core",
  "@unocss/preset-wind3",
  "@unocss/preset-typography",
  "@unocss/transformer-directives",
  "@unocss/transformer-variant-group",
  "css-tree",
] as const;

const SSR_OPTIMIZE_DEPS_EXCLUDES = [
  // Server/storage packages remain source modules in workerd development.
  // Pre-bundling them can strand relative resources or native fallbacks in
  // node_modules/.vite after a Vite environment restart.
  "@libsql/client",
  "drizzle-orm",
  "drizzle-orm/d1",
  "drizzle-orm/libsql",
  "drizzle-orm/sqlite-core",
  "otpauth",
  // Do NOT exclude astro/compiler-runtime (or other astro/* runtimes).
  // @astrojs/cloudflare intentionally prebundles them for the workerd SSR
  // environment; excluding them fights that include list and leaves the
  // runner holding stale deps_ssr URLs after re-optimization.
  // UnoCSS/css-tree keep JSON data files beside their package sources. Vite's
  // SSR pre-bundle can strand those relative requires under node_modules/.vite.
  "unocss",
  "css-tree",
  // UnoCSS tooling can pull in oxc-parser's optional WASM fallback, which is
  // not always installed in local dev environments and should not be pre-bundled.
  "@unocss/transformer-attributify-jsx",
  "oxc-parser",
  "oxc-walker",
  "@oxc-parser/binding-wasm32-wasi",
];

const SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES = [
  // Save/publish loads this compiler graph on demand. Keep the entire graph as
  // source in dev SSR so the first compile cannot replace deps_ssr and strand
  // the active Node or workerd runner on discarded hashed dependency URLs.
  "@unocss/core",
  "@unocss/extractor-arbitrary-variants",
  "@unocss/preset-mini",
  "@unocss/preset-typography",
  "@unocss/preset-wind3",
  "@unocss/rule-utils",
  "@unocss/transformer-directives",
  "@unocss/transformer-variant-group",
] as const;

const SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES = [
  // Imported by Astro's route cache after the server has started. If Vite
  // discovers it on the first request, it replaces deps_ssr while workerd still
  // references the previous generated route-cache chunk.
  "fast-xml-parser",
] as const;

/**
 * Under @cloudflare/vite-plugin, SSR is its own Vite environment.
 * Top-level `vite.ssr.optimizeDeps` does not reliably reach it — use
 * `configEnvironment` instead (same pattern Cloudflare uses for client).
 *
 * `ignoreOutdatedRequests` prevents 500s when Vite rewrites deps_ssr hashes
 * while the workerd runner still holds the previous browserHash.
 */
function ariaSsrOptimizeDepsPlugin() {
  return {
    name: "aria:ssr-optimize-deps",
    /** Configures dependency freshness for Astro SSR environments. */
    configEnvironment(environmentName: string) {
      if (!["ssr", "astro", "prerender"].includes(environmentName)) {
        return;
      }
      return {
        optimizeDeps: {
          exclude: [...SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES],
          include: [...SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES],
          ignoreOutdatedRequests: true,
        },
      };
    },
  };
}

const VUE_RUNTIME_CHUNK =
  /[\\/]node_modules[\\/](vue|@vue|@vueuse|reka-ui|vue-sonner|vue-router|vee-validate|@tanstack[\\/]vue-table|@tiptap)[\\/]/;

const TIPTAP_OPTIMIZE_DEPS = [
  "@tiptap/core",
  "@tiptap/extension-underline",
  "@tiptap/starter-kit",
  "@tiptap/extension-link",
  "@tiptap/extension-placeholder",
] as const;

const VUE_OPTIMIZE_DEPS = [
  "vue",
  "reka-ui",
  // Peer of reka-ui calendars; also imported by SchedulePublish.
  // Must be prebundled or HMR can leave stale @internationalized_date.js hashes
  // that break lazy routes (e.g. Collections → CMS/studio.ts).
  "@internationalized/date",
  "vue-sonner",
  "vue-router",
  "@vueuse/core",
  "@tanstack/vue-table",
  "vee-validate",
] as const;

// https://astro.build/config
export default defineConfig({
  output: "server",
  security: {
    // Aria mirrors Astro's origin check in middleware so the three public,
    // form-encoded OAuth protocol endpoints can be exempted without weakening
    // same-origin protection for signed-in decisions or the rest of the app.
    checkOrigin: false,
    actionBodySizeLimit: MEDIA_UPLOAD_ACTION_BODY_MAX_BYTES,
  },
  devToolbar: {
    enabled: false,
  },
  prerenderConflictBehavior: "error",
  vite: {
    plugins: [vue(), ariaSsrOptimizeDepsPlugin()],
    define: {
      "import.meta.env.PUBLIC_APP_VERSION": JSON.stringify(version),
      "import.meta.env.PUBLIC_ARIA_RUNTIME": JSON.stringify(runtimeTarget),
      "import.meta.env.PUBLIC_ASTRO_VERSION": JSON.stringify(astroVersion),
      "import.meta.env.PUBLIC_ASTRO_MAJOR": JSON.stringify(
        Number.isFinite(astroMajor) ? astroMajor : 0,
      ),
      "import.meta.env.PUBLIC_ASTRO_CLOUDFLARE_VERSION": JSON.stringify(
        readPackageVersion("@astrojs/cloudflare"),
      ),
      "import.meta.env.PUBLIC_ASTRO_VUE_VERSION": JSON.stringify(
        readPackageVersion("@astrojs/vue"),
      ),
      "import.meta.env.PUBLIC_UNOCSS_ASTRO_VERSION": JSON.stringify(
        readPackageVersion("@unocss/astro"),
      ),
      "import.meta.env.PUBLIC_VUE_VERSION": JSON.stringify(
        readPackageVersion("vue"),
      ),
    },
    build: {
      // Vite 8 / Rolldown: rollup manualChunks leaves orphaned init_*() calls
      // (init_runtime_dom_esm_bundler is not defined). Keep the Vue ecosystem in
      // one chunk via Rolldown codeSplitting instead.
      rolldownOptions: {
        external: BUILD_EXTERNALS,
        output: {
          codeSplitting: {
            groups: [
              {
                name: "vue-runtime",
                test: VUE_RUNTIME_CHUNK,
                priority: 20,
              },
            ],
          },
        },
      },
    },
    resolve: {
      dedupe: [
        "vue",
        "@vue/runtime-core",
        "@vue/runtime-dom",
        "@vue/reactivity",
        "@vue/shared",
      ],
      alias: {
        "@": path.join(workspaceRoot, "aria/admin"),
        "@aria-email/smtp-runtime": path.join(
          workspaceRoot,
          useNodeRuntime
            ? "aria/lib/email/providers/smtp-node-runtime.ts"
            : "aria/lib/email/providers/smtp-worker-runtime.ts",
        ),
        ...(useNodeRuntime
          ? {
              "cloudflare:workers": path.join(
                workspaceRoot,
                "aria/lib/cloudflare/workers-shim.ts",
              ),
            }
          : {
              "@libsql/client/node": path.join(
                workspaceRoot,
                "aria/lib/cloudflare/libsql-client-shim.ts",
              ),
              "@libsql/client": path.join(
                workspaceRoot,
                "aria/lib/cloudflare/libsql-client-shim.ts",
              ),
            }),
        // LibSQL imports this CommonJS dependency even in the Worker bundle.
        // Point Vite at an ESM-compatible implementation for workerd.
        "promise-limit": path.join(
          workspaceRoot,
          "aria/lib/vendor/libsql-promise-limit.ts",
        ),
        "@unocss/transformer-attributify-jsx": path.join(
          workspaceRoot,
          "aria/lib/vendor/unocss-transformer-attributify-jsx-stub.mjs",
        ),
      },
    },
    // Externalize server-only deps and Node built-ins used by storage/auth/media server modules.
    ssr: {
      external: SSR_EXTERNALS,
      ...(useNodeRuntime ? {} : { noExternal: [...UNOCSS_SSR_BUNDLE] }),
      optimizeDeps: {
        exclude: [
          ...(useNodeRuntime
            ? SSR_OPTIMIZE_DEPS_EXCLUDES
            : SSR_OPTIMIZE_DEPS_EXCLUDES.filter(
                (dep) =>
                  !UNOCSS_SSR_BUNDLE.includes(
                    dep as (typeof UNOCSS_SSR_BUNDLE)[number],
                  ),
              )),
          ...SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES,
        ],
        include: [...SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES],
      },
    },
    optimizeDeps: {
      exclude: [
        ...SSR_OPTIMIZE_DEPS_EXCLUDES,
        ...SSR_ENVIRONMENT_OPTIMIZE_DEPS_EXCLUDES,
        // EditorContent must share the Studio's Vue renderer. Pre-bundling this
        // Vue component can detach its template ref owner during route changes.
        "@tiptap/vue-3",
      ],
      // Keep Vue and its startup consumers in the same Rolldown optimizer
      // graph. Optimizing Vue while leaving these consumers as source caused
      // orphaned init_* calls during Vite 8 development restarts.
      // isomorphic-dompurify is imported from both client islands and SSR
      // paths; discovering it mid-request triggers deps_ssr rewrites that
      // strand the Cloudflare workerd runner on stale hashes.
      include: [
        "html-to-image",
        "isomorphic-dompurify",
        ...SSR_ENVIRONMENT_OPTIMIZE_DEPS_INCLUDES,
        ...VUE_OPTIMIZE_DEPS,
        ...TIPTAP_OPTIMIZE_DEPS,
      ],
    },
    server: {
      headers: {
        // Required for Private Network Access (PNA) - allows external scripts
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Private-Network": "true",
      },
    },
  },
  adapter: useNodeRuntime
    ? node({
        mode: "standalone",
      })
    : cloudflare({
        configPath: cloudflareConfigPath,
        imageService: "passthrough",
        remoteBindings: false,
        sessionKVBindingName: "session",
      }),
  integrations: [
    UnoCSS({
      configFile: "./uno.aria.config.ts",
    }),
    aria(), // Aria integration, see aria/integration.ts for details
  ],
});
