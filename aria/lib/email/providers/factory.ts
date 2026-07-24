import { CloudflareEmailConfigSchema, CloudflareEmailSecretSchema, PreviewConfigSchema, SmtpConfigSchema, SmtpSecretSchema, type EmailConnection } from "../types";
import { createSmtpTransport, SMTP_TRANSPORT_RUNTIME } from "@aria-email/smtp-runtime";
import { CloudflareEmailTransport } from "./cloudflare";
import { PreviewEmailTransport } from "./preview";
import type { EmailProviderTransport } from "./types";

export async function createEmailProvider(connection:EmailConnection,secret:unknown,runtime:"node"|"cloudflare"):Promise<EmailProviderTransport>{
  if(connection.provider==="cloudflare_email"){const config=CloudflareEmailConfigSchema.parse(connection.config),credentials=CloudflareEmailSecretSchema.parse(secret);return new CloudflareEmailTransport(config.accountId,config.zoneId,config.sendingDomain,credentials.apiToken);}
  if(connection.provider==="smtp"){const config=SmtpConfigSchema.parse(connection.config),credentials=SmtpSecretSchema.parse(secret);if(runtime!==SMTP_TRANSPORT_RUNTIME)throw new Error("EMAIL_SMTP_RUNTIME_MISMATCH");return createSmtpTransport(config,credentials.password);}
  PreviewConfigSchema.parse(connection.config);return new PreviewEmailTransport();
}
