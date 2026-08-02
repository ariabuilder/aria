declare module "cloudflare:test" {
  export const env: {
    aria_studio_live?: import("../../lib/cloudflare/env").AriaStudioLiveNamespace;
    aria_db?: D1Database;
  };
}
