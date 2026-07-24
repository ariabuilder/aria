import type { z } from "zod";
import type { SmtpConfigSchema } from "../types";
import { WorkerSmtpTransport } from "./smtp-worker";
import type { EmailProviderTransport } from "./types";

type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

/** Selected by the Cloudflare build alias; safe to import cloudflare:sockets. */
export const SMTP_TRANSPORT_RUNTIME = "cloudflare" as const;

export function createSmtpTransport(
  config: SmtpConfig,
  password: string,
): EmailProviderTransport {
  return new WorkerSmtpTransport(config, password);
}
