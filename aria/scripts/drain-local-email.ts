import { z } from "zod";
import { getEmailRepositoryAsync } from "../lib/email/getEmailRepository";
import { createEmailService } from "../lib/email/service";

const ArgsSchema=z.object({watch:z.boolean(),limit:z.int().min(1).max(100)});
const args=ArgsSchema.parse({watch:process.argv.includes("--watch"),limit:Number(process.argv.find((value)=>value.startsWith("--limit="))?.split("=")[1]??25)});
const repository=await getEmailRepositoryAsync(),service=createEmailService(repository);
async function drain():Promise<number>{const due=await repository.findRecoverableDeliveries(new Date().toISOString(),args.limit);for(const delivery of due)await service.processDelivery(delivery.siteId,delivery.id);return due.length;}
do{const count=await drain();console.info(JSON.stringify({event:"email.local.drain",processed:count}));if(args.watch)await new Promise((resolve)=>setTimeout(resolve,count>0?250:2_000));}while(args.watch);
