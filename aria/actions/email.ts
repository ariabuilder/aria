import { ActionError, defineAction } from "astro:actions";
import { z } from "zod";
import { requireOperation } from "./_shared";
import { getEmailRepositoryAsync } from "../lib/email/getEmailRepository";
import { createEmailService } from "../lib/email/service";
import { resolveEmailSiteContext } from "../lib/email/siteScope";
import {
  CloudflareEmailSecretSchema, DeliveryListQuerySchema, EmailAttemptSchema,
  EmailConnectionCreateSchema, EmailConnectionSchema, EmailPurposeSchema,
  EmailRouteSchema, SafeEmailDeliverySchema, SmtpSecretSchema,
} from "../lib/email/types";

const IdSchema=z.object({id:z.uuid()});
const ConnectionUpdateSchema=z.object({id:z.uuid(),patch:z.object({name:z.string().trim().min(1).max(100).optional(),enabled:z.boolean().optional(),fromEmail:z.email().optional(),fromName:z.string().trim().max(100).nullable().optional(),replyToEmail:z.email().nullable().optional(),config:z.unknown().optional()})});
const ReplaceSecretSchema=z.object({id:z.uuid(),secret:z.union([CloudflareEmailSecretSchema,SmtpSecretSchema])});
const SendTestSchema=z.object({id:z.uuid(),to:z.email()});
const ReplaceRoutesSchema=z.object({purpose:EmailPurposeSchema,connectionIds:z.array(z.uuid()).max(20)});
const DrainSchema=z.object({limit:z.int().min(1).max(100).default(25)});
const SafeConnectionListSchema=z.array(EmailConnectionSchema);

async function dependencies(locals:App.Locals){const repository=await getEmailRepositoryAsync(locals);return{repository,service:createEmailService(repository,locals),siteId:resolveEmailSiteContext(locals).siteId};}
function mapError(error:unknown):never{const message=error instanceof Error?error.message:"EMAIL_INTERNAL_ERROR";const notFound=message.endsWith("NOT_FOUND");throw new ActionError({code:notFound?"NOT_FOUND":message.includes("NOT_RETRYABLE")||message.includes("DISABLED")?"CONFLICT":"BAD_REQUEST",message});}
function safeDelivery(value:unknown){return SafeEmailDeliverySchema.parse(value);}

export const email={
  connections:{
    list:defineAction({accept:"json",handler:async(_,context)=>{await requireOperation(context,"email.connections.list");const{service,siteId}=await dependencies(context.locals);return SafeConnectionListSchema.parse(await service.listConnections(siteId));}}),
    get:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.connections.get");const{service,siteId}=await dependencies(context.locals);const value=await service.getConnection(siteId,input.id);return value?EmailConnectionSchema.parse(value):null;}}),
    create:defineAction({accept:"json",input:EmailConnectionCreateSchema,handler:async(input,context)=>{const actor=await requireOperation(context,"email.connections.create");const{service,siteId}=await dependencies(context.locals);try{return EmailConnectionSchema.parse(await service.createConnection(siteId,input,actor.id));}catch(error){return mapError(error);}}}),
    update:defineAction({accept:"json",input:ConnectionUpdateSchema,handler:async(input,context)=>{const actor=await requireOperation(context,"email.connections.update");const{service,siteId}=await dependencies(context.locals);try{return EmailConnectionSchema.parse(await service.updateConnection(siteId,input.id,input.patch,actor.id));}catch(error){return mapError(error);}}}),
    replaceSecret:defineAction({accept:"json",input:ReplaceSecretSchema,handler:async(input,context)=>{await requireOperation(context,"email.connections.replaceSecret");const{service,siteId}=await dependencies(context.locals);try{await service.replaceSecret(siteId,input.id,input.secret);return z.object({success:z.literal(true)}).parse({success:true});}catch(error){return mapError(error);}}}),
    delete:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.connections.delete");const{service,siteId}=await dependencies(context.locals);return z.object({deleted:z.boolean()}).parse({deleted:await service.deleteConnection(siteId,input.id)});}}),
    verify:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.connections.verify");const{service,siteId}=await dependencies(context.locals);return z.object({ok:z.boolean(),code:z.string().optional(),message:z.string()}).parse(await service.verifyConnection(siteId,input.id));}}),
    sendTest:defineAction({accept:"json",input:SendTestSchema,handler:async(input,context)=>{const actor=await requireOperation(context,"email.connections.sendTest");const{service,siteId}=await dependencies(context.locals);try{const result=await service.sendConnectionTest(siteId,input.id,input.to,actor.id);return z.object({delivery:SafeEmailDeliverySchema,created:z.boolean(),wakeUpPending:z.boolean()}).parse({...result,delivery:safeDelivery(result.delivery)});}catch(error){return mapError(error);}}}),
  },
  routes:{
    list:defineAction({accept:"json",handler:async(_,context)=>{await requireOperation(context,"email.routes.list");const{service,siteId}=await dependencies(context.locals);return z.array(EmailRouteSchema).parse(await service.listRoutes(siteId));}}),
    replacePurpose:defineAction({accept:"json",input:ReplaceRoutesSchema,handler:async(input,context)=>{await requireOperation(context,"email.routes.replacePurpose");const{service,siteId}=await dependencies(context.locals);try{return z.array(EmailRouteSchema).parse(await service.replaceRoutes(siteId,input.purpose,input.connectionIds));}catch(error){return mapError(error);}}}),
  },
  outbox:{
    overview:defineAction({accept:"json",handler:async(_,context)=>{await requireOperation(context,"email.outbox.overview");const{service,siteId}=await dependencies(context.locals);return z.record(z.string(),z.int().nonnegative()).parse(await service.getOverview(siteId));}}),
    list:defineAction({accept:"json",input:DeliveryListQuerySchema,handler:async(input,context)=>{await requireOperation(context,"email.outbox.list");const{service,siteId}=await dependencies(context.locals);const result=await service.listDeliveries(siteId,input);return z.object({items:z.array(SafeEmailDeliverySchema),nextCursor:z.string().nullable()}).parse({items:result.items.map(safeDelivery),nextCursor:result.nextCursor});}}),
    get:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.outbox.get");const{service,siteId}=await dependencies(context.locals);const value=await service.getDelivery(siteId,input.id);return value?safeDelivery(value):null;}}),
    attempts:defineAction({accept:"json",input:z.object({deliveryId:z.uuid()}),handler:async(input,context)=>{await requireOperation(context,"email.outbox.attempts");const{service,siteId}=await dependencies(context.locals);return z.array(EmailAttemptSchema).parse(await service.getAttempts(siteId,input.deliveryId));}}),
    cancel:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.outbox.cancel");const{service,siteId}=await dependencies(context.locals);return z.object({canceled:z.boolean()}).parse({canceled:await service.cancel(siteId,input.id)});}}),
    retry:defineAction({accept:"json",input:IdSchema,handler:async(input,context)=>{await requireOperation(context,"email.outbox.retry");const{service,siteId}=await dependencies(context.locals);try{return safeDelivery(await service.retry(siteId,input.id));}catch(error){return mapError(error);}}}),
    drainLocal:defineAction({accept:"json",input:DrainSchema,handler:async(input,context)=>{await requireOperation(context,"email.outbox.drainLocal");if(import.meta.env.PROD)throw new ActionError({code:"FORBIDDEN",message:"Local drain is development-only"});const{repository,service}=await dependencies(context.locals);const due=await repository.findRecoverableDeliveries(new Date().toISOString(),input.limit);for(const delivery of due)await service.processDelivery(delivery.siteId,delivery.id);return z.object({processed:z.int()}).parse({processed:due.length});}}),
  },
};
