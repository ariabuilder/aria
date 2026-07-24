import type { AriaCloudflareEnv, RuntimeLocals } from "../lib/cloudflare/env";
import { getEmailRepositoryAsync } from "../lib/email/getEmailRepository";
import { createEmailService } from "../lib/email/service";
import { EmailQueueMessageSchema, type EmailQueueMessage } from "../lib/email/types";

export interface EmailQueueMessageHandle {
  readonly body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}
export interface EmailMessageBatch {
  readonly queue?: string;
  readonly messages: readonly EmailQueueMessageHandle[];
}

function locals(env:AriaCloudflareEnv):RuntimeLocals{return{cfBindings:env};}
export async function handleEmailQueue(batch:EmailMessageBatch,env:AriaCloudflareEnv):Promise<void>{const repository=await getEmailRepositoryAsync(locals(env)),service=createEmailService(repository,locals(env));for(const message of batch.messages){const parsed=EmailQueueMessageSchema.safeParse(message.body);if(!parsed.success){console.error(JSON.stringify({event:"email.queue.invalid",issues:parsed.error.issues}));message.ack();continue;}if(batch.queue?.endsWith("-dlq")){const now=new Date();await repository.failQueueExhausted(parsed.data.siteId,parsed.data.deliveryId,now.toISOString(),new Date(now.getTime()+7*86_400_000).toISOString());message.ack();continue;}try{const result=await service.processDelivery(parsed.data.siteId,parsed.data.deliveryId);if(result.terminal){message.ack();continue;}const delaySeconds=result.retryAt?Math.max(0,Math.ceil((Date.parse(result.retryAt)-Date.now())/1000)):30;message.retry({delaySeconds});}catch(error){console.error(JSON.stringify({event:"email.queue.unhandled",deliveryId:parsed.data.deliveryId,error:error instanceof Error?error.message:"unknown"}));message.retry({delaySeconds:30});}}}
export async function reconcileEmailDeliveries(env:AriaCloudflareEnv):Promise<void>{const repository=await getEmailRepositoryAsync(locals(env)),now=new Date().toISOString();await repository.recoverExpiredLeases(now);const due=await repository.findRecoverableDeliveries(now,100);for(const delivery of due){await env.aria_email_queue?.send(EmailQueueMessageSchema.parse({version:1,siteId:delivery.siteId,deliveryId:delivery.id} satisfies EmailQueueMessage));}await repository.purgeExpiredPayloads(now,500);await repository.purgeExpiredMetadata(now,500);}
