import type { AstroIntegration } from "astro";
import path from "node:path";
import { z } from "zod";

const RenderingParityRuntimeSchema = z.enum(["node", "workerd"]);

const RENDERING_PARITY_ROUTES = [
  {
    pattern: "/aria-rendering-parity-public",
    entrypoint: "./aria/pages/rendering-parity-public.astro",
  },
  {
    pattern: "/aria-rendering-parity-stage",
    entrypoint: "./aria/pages/rendering-parity-stage.astro",
  },
  {
    pattern: "/aria-rendering-parity-compiler",
    entrypoint: "./aria/pages/rendering-parity-compiler.ts",
  },
  {
    pattern: "/media/source/current/rendering-parity.svg",
    entrypoint: "./aria/pages/rendering-parity-media.ts",
  },
  {
    pattern: "/aria-rendering-parity-lifecycle",
    entrypoint: "./aria/pages/rendering-parity-lifecycle.ts",
  },
] as const;

export function getRenderingParityRoutes(runtime: unknown) {
  return RenderingParityRuntimeSchema.safeParse(runtime).success
    ? RENDERING_PARITY_ROUTES
    : [];
}

export function aria(): AstroIntegration {
  return {
    name: "aria-integration",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig }) => {
        const renderingParityRoutes = getRenderingParityRoutes(
          process.env.ARIA_RENDERING_PARITY_RUNTIME,
        );
        // Configure Vite (SSR, Watcher, HMR)
        const viteConfig: Parameters<typeof updateConfig>[0]["vite"] = {
          resolve: {
            alias: {
              "@": path.resolve(process.cwd(), "./aria/admin"),
            },
          },
          server: {
            watch: {
              ignored: [
                "**/.wrangler/**",
                "**/aria/config/**",
                "**/aria/storage/metadata/**",
                "**/aria/storage/pages/**",
                "**/aria/storage/layouts/**",
                "**/aria/storage/components/**",
                "**/aria/storage/snapshots/**",
                "**/aria/storage/styles/**",
                "**/aria/storage/versions/**",
                "**/aria/storage/dsl/**",
                "**/aria/lib/schemas/**",
              ],
            },
            hmr: {
              overlay: false,
            },
          },
        };

        updateConfig({
          vite: viteConfig,
        });

        // Inject Builder UI Route
        // Aria Builder: Visual page builder at /admin
        injectRoute({
          pattern: "/admin",
          entrypoint: "./aria/pages/admin.astro",
        });
        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: "./aria/pages/admin.astro",
        });

        // Auth pages
        injectRoute({
          pattern: "/admin/login",
          entrypoint: "./aria/pages/login.astro",
        });
        injectRoute({
          pattern: "/admin/setup",
          entrypoint: "./aria/pages/setup.astro",
        });
        injectRoute({
          pattern: "/admin/forgot-password",
          entrypoint:
            "./aria/admin/features/Auth/pages/ForgotPasswordPage.astro",
        });
        injectRoute({
          pattern: "/admin/reset-password",
          entrypoint:
            "./aria/admin/features/Auth/pages/ResetPasswordPage.astro",
        });

        if (renderingParityRoutes.length > 0) {
          // Test-only routes are absent from normal Node and Cloudflare builds.
          // Route handlers retain loopback checks as defense in depth.
          renderingParityRoutes.forEach(injectRoute);
        }

        // All Aria endpoints use Astro Actions at /_actions/*
      },
    },
  };
}
