import type { RuntimeLocals } from "../cloudflare/env";

export type EmailSiteContext = Readonly<{ siteId: string }>;

export function resolveEmailSiteContext(_locals?: RuntimeLocals): EmailSiteContext {
  return { siteId: "default" };
}
