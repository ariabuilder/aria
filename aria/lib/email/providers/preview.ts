import type { ConnectionVerification, EmailProviderTransport, ProviderSendOutcome, RenderedEmailMessage } from "./types";
export class PreviewEmailTransport implements EmailProviderTransport {
  readonly provider="preview" as const;
  async verify():Promise<ConnectionVerification>{return{ok:true,message:"Development preview is available"};}
  async send(message:RenderedEmailMessage):Promise<ProviderSendOutcome>{console.info(JSON.stringify({event:"email.preview",deliveryId:message.deliveryId,to:message.to,subject:message.subject,text:message.text}));return{kind:"accepted",messageId:`preview-${crypto.randomUUID()}`};}
}
