import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ConnectionVerification, EmailProviderTransport, ProviderSendOutcome, RenderedEmailMessage } from "./types";
import type { z } from "zod";
import type { SmtpConfigSchema } from "../types";
type SmtpConfig = z.infer<typeof SmtpConfigSchema>;
export class NodeSmtpTransport implements EmailProviderTransport {
  readonly provider="smtp" as const;
  constructor(private readonly config:SmtpConfig,private readonly password:string){}
  private client(){return nodemailer.createTransport({host:this.config.host,port:this.config.port,secure:this.config.port===465,requireTLS:this.config.port===587,auth:{user:this.config.username,pass:this.password},connectionTimeout:15_000,greetingTimeout:15_000,socketTimeout:30_000,tls:{rejectUnauthorized:true}});}
  private async assertPublicHost():Promise<void>{const records=await lookup(this.config.host,{all:true,verbatim:true});if(records.length===0)throw new Error("SMTP_HOST_UNRESOLVED");for(const record of records){const address=record.address.toLowerCase();if(isIP(address)===4){const parts=address.split(".").map(Number);if(parts[0]===10||parts[0]===127||(parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168))throw new Error("SMTP_PRIVATE_HOST_BLOCKED");}else if(address==="::1"||address.startsWith("fc")||address.startsWith("fd")||address.startsWith("fe80:"))throw new Error("SMTP_PRIVATE_HOST_BLOCKED");}}
  async verify():Promise<ConnectionVerification>{try{await this.assertPublicHost();await this.client().verify();return{ok:true,message:"SMTP TLS and authentication verified"};}catch{return{ok:false,code:"SMTP_VERIFY_FAILED",message:"SMTP verification failed"};}}
  async send(message:RenderedEmailMessage):Promise<ProviderSendOutcome>{try{await this.assertPublicHost();const result=await this.client().sendMail({from:{address:message.from,name:message.fromName},replyTo:message.replyTo,to:message.to,cc:message.cc,bcc:message.bcc,subject:message.subject,html:message.html,text:message.text,messageId:`<${message.deliveryId}@${message.from.split("@")[1]}>`});return{kind:"accepted",messageId:result.messageId};}catch(error){const code=typeof error==="object"&&error!==null&&"responseCode" in error&&typeof error.responseCode==="number"?error.responseCode:0;return{kind:code>=400&&code<500?"transient_failure":"permanent_failure",code:code?`SMTP_${code}`:"SMTP_SEND_FAILED",errorClass:code===535?"authentication":code>=500?"provider":"network",message:"SMTP delivery failed"};}}
}
