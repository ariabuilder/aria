import type { z } from "zod";
import type { SmtpConfigSchema } from "../types";
import { NodeSmtpTransport } from "./smtp-node";
import type { EmailProviderTransport } from "./types";

type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

/** Selected by the Node build alias; never includes Worker-only modules. */
export const SMTP_TRANSPORT_RUNTIME = "node" as const;

export function createSmtpTransport(
  config: SmtpConfig,
  password: string,
): EmailProviderTransport {
  return new NodeSmtpTransport(config, password);
}
