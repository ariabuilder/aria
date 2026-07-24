import { z } from "zod";

export type RenderedTemplate = Readonly<{ subject: string; html: string; text: string }>;
export type SystemTemplate<T> = Readonly<{ key: string; version: number; variablesSchema: z.ZodType<T>; render(value: T): RenderedTemplate }>;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function safeUrl(value: string): string { const url = z.url().parse(value); if (!url.startsWith("https://") && !url.startsWith("http://localhost")) throw new Error("EMAIL_TEMPLATE_URL_UNSAFE"); return escapeHtml(url); }

const PasswordResetVariablesSchema = z.object({ username: z.string().min(1).max(100), resetUrl: z.url(), expiresInMinutes: z.int().min(1).max(1440) });
const ConnectionTestVariablesSchema = z.object({ connectionName: z.string().min(1).max(100), sentAt: z.iso.datetime() });
const FormSubmissionVariablesSchema = z.object({ formName: z.string().min(1).max(200), submissionId: z.string().min(1).max(200), summary: z.string().max(20_000) });

const passwordReset: SystemTemplate<z.infer<typeof PasswordResetVariablesSchema>> = {
  key: "password_reset", version: 1, variablesSchema: PasswordResetVariablesSchema,
  render(value) { const name=escapeHtml(value.username), url=safeUrl(value.resetUrl); const subject="Reset your Aria password"; return { subject, html:`<!doctype html><html><body><h1>${subject}</h1><p>Hi ${name},</p><p><a href="${url}">Reset your password</a></p><p>This link expires in ${value.expiresInMinutes} minutes.</p><p>If you did not request this, ignore this email.</p></body></html>`, text:`Hi ${value.username},\n\nReset your password: ${value.resetUrl}\n\nThis link expires in ${value.expiresInMinutes} minutes.\n\nIf you did not request this, ignore this email.` }; },
};
const connectionTest: SystemTemplate<z.infer<typeof ConnectionTestVariablesSchema>> = {
  key:"connection_test",version:1,variablesSchema:ConnectionTestVariablesSchema,
  render(value){const name=escapeHtml(value.connectionName);return{subject:"Aria email connection test",html:`<!doctype html><html><body><h1>Connection verified</h1><p>Aria successfully used <strong>${name}</strong> at ${escapeHtml(value.sentAt)}.</p></body></html>`,text:`Aria successfully used ${value.connectionName} at ${value.sentAt}.`};},
};
const formSubmission: SystemTemplate<z.infer<typeof FormSubmissionVariablesSchema>> = {
  key:"form_submission_notification",version:1,variablesSchema:FormSubmissionVariablesSchema,
  render(value){return{subject:`New submission: ${value.formName.replace(/[\r\n]/gu," ")}`,html:`<!doctype html><html><body><h1>New form submission</h1><p>Form: ${escapeHtml(value.formName)}</p><p>Submission: ${escapeHtml(value.submissionId)}</p><pre>${escapeHtml(value.summary)}</pre></body></html>`,text:`New form submission\nForm: ${value.formName}\nSubmission: ${value.submissionId}\n\n${value.summary}`};},
};

const templates = [passwordReset, connectionTest, formSubmission] as const;
export type SystemTemplateKey = (typeof templates)[number]["key"];
export function getSystemTemplate(key: string, version?: number): SystemTemplate<unknown> {
  const template = templates.find((candidate) => candidate.key === key && (version === undefined || candidate.version === version));
  if (!template) throw new Error("EMAIL_TEMPLATE_NOT_FOUND");
  const variablesSchema: z.ZodType<unknown> =
    template.key === "password_reset"
      ? passwordReset.variablesSchema
      : template.key === "connection_test"
        ? connectionTest.variablesSchema
        : formSubmission.variablesSchema;
  return {
    key: template.key,
    version: template.version,
    variablesSchema,
    render(value: unknown): RenderedTemplate {
      if (template.key === "password_reset") return passwordReset.render(passwordReset.variablesSchema.parse(value));
      if (template.key === "connection_test") return connectionTest.render(connectionTest.variablesSchema.parse(value));
      return formSubmission.render(formSubmission.variablesSchema.parse(value));
    },
  };
}
