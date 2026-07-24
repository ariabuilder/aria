export type AriaRuntimeTarget = "node" | "cloudflare";

export interface AriaPackageVersion {
  name: string;
  version: string;
  note?: string;
}

export interface AriaCompilerMetadata {
  aria: {
    version: string;
  };
  astro: {
    version: string;
    major: number;
  };
  runtime: AriaRuntimeTarget;
  storageSchemaVersion: string;
  capturedAt: string;
}

export interface AriaProjectSystemMetadata {
  projectCreatedAt: string;
  createdWith: AriaCompilerMetadata;
}

export interface AriaSystemVersionReport {
  current: AriaCompilerMetadata;
  packages: AriaPackageVersion[];
  acknowledgements: AriaPackageVersion[];
}

export const ARIA_STORAGE_SCHEMA_VERSION = "baseline";

type RuntimeEnv = Record<string, unknown>;

const IMPORT_META_ENV =
  (import.meta as ImportMeta & { env?: RuntimeEnv }).env ?? {};

const BUILD_ENV: RuntimeEnv = {
  PUBLIC_APP_VERSION: IMPORT_META_ENV.PUBLIC_APP_VERSION,
  PUBLIC_ARIA_RUNTIME: IMPORT_META_ENV.PUBLIC_ARIA_RUNTIME,
  PUBLIC_ASTRO_VERSION: IMPORT_META_ENV.PUBLIC_ASTRO_VERSION,
  PUBLIC_ASTRO_MAJOR: IMPORT_META_ENV.PUBLIC_ASTRO_MAJOR,
  PUBLIC_ASTRO_CLOUDFLARE_VERSION:
    IMPORT_META_ENV.PUBLIC_ASTRO_CLOUDFLARE_VERSION,
  PUBLIC_ASTRO_VUE_VERSION: IMPORT_META_ENV.PUBLIC_ASTRO_VUE_VERSION,
  PUBLIC_UNOCSS_ASTRO_VERSION: IMPORT_META_ENV.PUBLIC_UNOCSS_ASTRO_VERSION,
  PUBLIC_VUE_VERSION: IMPORT_META_ENV.PUBLIC_VUE_VERSION,
};

function viteEnv(): RuntimeEnv {
  return BUILD_ENV;
}

function processEnv(): RuntimeEnv {
  return typeof process === "undefined" ? {} : process.env;
}

function readEnv(name: string): unknown {
  const fromVite = viteEnv()[name];
  if (fromVite !== undefined) {
    return fromVite;
  }

  return processEnv()[name];
}

function readAppVersionEnv(): unknown {
  return readEnv("PUBLIC_APP_VERSION") ?? readEnv("npm_package_version");
}

function readRuntimeEnv(): unknown {
  return readEnv("PUBLIC_ARIA_RUNTIME") ?? readEnv("ARIA_RUNTIME");
}

function stringEnv(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function numberEnv(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function runtimeEnv(value: unknown): AriaRuntimeTarget {
  return value === "node" ? "node" : "cloudflare";
}

export function buildCurrentCompilerMetadata(
  capturedAt = new Date().toISOString(),
): AriaCompilerMetadata {
  return {
    aria: {
      version: stringEnv(readAppVersionEnv(), "0.0.0"),
    },
    astro: {
      version: stringEnv(readEnv("PUBLIC_ASTRO_VERSION")),
      major: numberEnv(readEnv("PUBLIC_ASTRO_MAJOR")),
    },
    runtime: runtimeEnv(readRuntimeEnv()),
    storageSchemaVersion: ARIA_STORAGE_SCHEMA_VERSION,
    capturedAt,
  };
}

export function buildProjectSystemMetadata(
  projectCreatedAt = new Date().toISOString(),
): AriaProjectSystemMetadata {
  return {
    projectCreatedAt,
    createdWith: buildCurrentCompilerMetadata(projectCreatedAt),
  };
}

export function buildSystemVersionReport(): AriaSystemVersionReport {
  return {
    current: buildCurrentCompilerMetadata(),
    packages: [
      {
        name: "Aria",
        version: stringEnv(readAppVersionEnv(), "0.0.0"),
        note: "Builder",
      },
      {
        name: "Astro",
        version: stringEnv(readEnv("PUBLIC_ASTRO_VERSION")),
        note: `Compiler major ${numberEnv(readEnv("PUBLIC_ASTRO_MAJOR"))}`,
      },
      {
        name: "@astrojs/cloudflare",
        version: stringEnv(readEnv("PUBLIC_ASTRO_CLOUDFLARE_VERSION")),
        note: "Adapter",
      },
      {
        name: "@astrojs/vue",
        version: stringEnv(readEnv("PUBLIC_ASTRO_VUE_VERSION")),
        note: "Integration",
      },
      {
        name: "Vue",
        version: stringEnv(readEnv("PUBLIC_VUE_VERSION")),
        note: "Admin UI",
      },
      {
        name: "@unocss/astro",
        version: stringEnv(readEnv("PUBLIC_UNOCSS_ASTRO_VERSION")),
        note: "Utility engine",
      },
    ],
    acknowledgements: [
      {
        name: "Acknowledgements",
        version: "acknowledgements.md",
        note: "Project credits and third-party notices",
      },
      {
        name: "Third-party npm licenses",
        version: "licenses/THIRD-PARTY-NPM.txt",
        note: "Packaged dependency license summary",
      },
    ],
  };
}

export function serializeCompilerMetadata(
  metadata: AriaCompilerMetadata,
): string {
  return JSON.stringify(metadata);
}
