import type { EmailErrorClass, EmailProvider } from "../types";

export type RenderedEmailMessage = Readonly<{ deliveryId: string; from: string; fromName?: string; replyTo?: string; to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; text: string }>;
export type ProviderSendOutcome =
  | Readonly<{ kind: "accepted" | "queued_by_provider"; messageId?: string; metadata?: Record<string, string | number | boolean> }>
  | Readonly<{ kind: "transient_failure" | "permanent_failure"; code: string; errorClass: EmailErrorClass; message: string }>;
export type ConnectionVerification = Readonly<{ ok: boolean; code?: string; message: string }>;
export interface EmailProviderTransport { readonly provider: EmailProvider; verify(): Promise<ConnectionVerification>; send(message: RenderedEmailMessage): Promise<ProviderSendOutcome>; }
