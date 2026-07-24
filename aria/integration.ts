import type { AstroIntegration } from "astro";
import path from "node:path";

export function aria(): AstroIntegration {
  return {
    name: "aria-integration",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig }) => {
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

        // All Aria endpoints use Astro Actions at /_actions/*
      },
    },
  };
}
