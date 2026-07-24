import { z } from "zod";
import {
  DeliveryListQuerySchema,
  EmailAttemptSchema,
  EmailConnectionSchema,
  EmailDeliverySchema,
  EmailRouteSchema,
  EncryptedEnvelopeSchema,
  type DeliveryListQuery,
  type EmailAttempt,
  type EmailConnection,
  type EmailDelivery,
  type EmailPurpose,
  type EmailRoute,
  type EncryptedEnvelope,
} from "./types";

export type SqlRunResult = Readonly<{ changes: number }>;
export interface EmailSqlExecutor {
  run(sql: string, parameters?: readonly unknown[]): Promise<SqlRunResult>;
  all(sql: string, parameters?: readonly unknown[]): Promise<readonly unknown[]>;
}

const DbRowSchema = z.record(z.string(), z.unknown());
const StringArrayJsonSchema = z.string().transform((value, context) => {
  try { return z.array(z.email()).max(50).parse(JSON.parse(value)); }
  catch { context.addIssue({ code: "custom", message: "Invalid email address JSON" }); return z.NEVER; }
});
const ObjectJsonSchema = z.string().transform((value, context) => {
  try { return z.record(z.string(), z.unknown()).parse(JSON.parse(value)); }
  catch { context.addIssue({ code: "custom", message: "Invalid object JSON" }); return z.NEVER; }
});
const NullableObjectJsonSchema = z.string().nullable().transform((value, context) => {
  if (value === null) return null;
  try { return z.record(z.string(), z.unknown()).parse(JSON.parse(value)); }
  catch { context.addIssue({ code: "custom", message: "Invalid metadata JSON" }); return z.NEVER; }
});
const bool = (value: unknown): boolean => z.union([z.literal(0), z.literal(1)]).parse(value) === 1;

function connectionFromRow(input: unknown): EmailConnection {
  const r = DbRowSchema.parse(input);
  return EmailConnectionSchema.parse({ id: r.id, siteId: r.site_id, name: r.name, provider: r.provider, enabled: bool(r.enabled), fromEmail: r.from_email, fromName: r.from_name, replyToEmail: r.reply_to_email, config: ObjectJsonSchema.parse(r.config_json), credentialState: r.credential_state, healthState: r.health_state, lastCheckedAt: r.last_checked_at, lastErrorCode: r.last_error_code, lastErrorMessage: r.last_error_message, createdAt: r.created_at, updatedAt: r.updated_at, createdByUserId: r.created_by_user_id, updatedByUserId: r.updated_by_user_id });
}
function routeFromRow(input: unknown): EmailRoute {
  const r = DbRowSchema.parse(input);
  return EmailRouteSchema.parse({ id: r.id, siteId: r.site_id, purpose: r.purpose, connectionId: r.connection_id, priority: r.priority, enabled: bool(r.enabled), createdAt: r.created_at, updatedAt: r.updated_at });
}
function deliveryFromRow(input: unknown): EmailDelivery {
  const r = DbRowSchema.parse(input);
  const hasPayload = r.payload_ciphertext_base64 !== null;
  const payload = hasPayload ? EncryptedEnvelopeSchema.parse({ ciphertextBase64: r.payload_ciphertext_base64, ivBase64: r.payload_iv_base64, keyId: r.payload_key_id, algorithm: "AES-256-GCM" }) : null;
  return EmailDeliverySchema.parse({ id: r.id, siteId: r.site_id, purpose: r.purpose, templateKey: r.template_key, templateVersion: r.template_version, status: r.status, providerDisposition: r.provider_disposition, connectionId: r.connection_id, to: StringArrayJsonSchema.parse(r.to_json), cc: StringArrayJsonSchema.parse(r.cc_json), bcc: StringArrayJsonSchema.parse(r.bcc_json), subject: r.subject, payload, idempotencyKey: r.idempotency_key, attemptCount: r.attempt_count, maxAttempts: r.max_attempts, nextAttemptAt: r.next_attempt_at, leaseToken: r.lease_token, leaseExpiresAt: r.lease_expires_at, lastErrorCode: r.last_error_code, lastErrorMessage: r.last_error_message, providerMessageId: r.provider_message_id, createdByUserId: r.created_by_user_id, createdAt: r.created_at, updatedAt: r.updated_at, acceptedAt: r.accepted_at, terminalAt: r.terminal_at, payloadPurgeAt: r.payload_purge_at, metadataPurgeAt: r.metadata_purge_at });
}
function attemptFromRow(input: unknown): EmailAttempt {
  const r = DbRowSchema.parse(input);
  return EmailAttemptSchema.parse({ id: r.id, siteId: r.site_id, deliveryId: r.delivery_id, connectionId: r.connection_id, attemptNumber: r.attempt_number, outcome: r.outcome, errorClass: r.error_class, errorCode: r.error_code, errorMessage: r.error_message, providerMessageId: r.provider_message_id, providerResponse: NullableObjectJsonSchema.parse(r.provider_response_json), latencyMs: r.latency_ms, startedAt: r.started_at, finishedAt: r.finished_at });
}

export type ConnectionInsert = Omit<EmailConnection, "lastCheckedAt" | "lastErrorCode" | "lastErrorMessage" | "healthState" | "credentialState">;
export type DeliveryInsert = Omit<EmailDelivery, "attemptCount" | "status" | "connectionId" | "providerDisposition" | "leaseToken" | "leaseExpiresAt" | "lastErrorCode" | "lastErrorMessage" | "providerMessageId" | "acceptedAt" | "terminalAt" | "subject"> & { connectionId?: string | null };
export type PaginatedDeliveries = Readonly<{ items: EmailDelivery[]; nextCursor: string | null }>;
export type ManagedEmailKey = Readonly<{ keyId: string; keyBase64: string }>;

export interface EmailRepository {
  listConnections(siteId: string): Promise<EmailConnection[]>;
  getConnection(siteId: string, id: string): Promise<EmailConnection | null>;
  createConnection(input: ConnectionInsert): Promise<EmailConnection>;
  updateConnection(siteId: string, id: string, input: Pick<EmailConnection, "name" | "enabled" | "fromEmail" | "fromName" | "replyToEmail" | "config" | "updatedByUserId">): Promise<EmailConnection | null>;
  saveConnectionSecret(siteId: string, connectionId: string, envelope: EncryptedEnvelope): Promise<void>;
  getConnectionSecret(siteId: string, connectionId: string): Promise<EncryptedEnvelope | null>;
  updateConnectionHealth(siteId: string, id: string, state: "healthy" | "degraded" | "failed", code?: string, message?: string): Promise<void>;
  deleteConnection(siteId: string, id: string): Promise<boolean>;
  listRoutes(siteId: string): Promise<EmailRoute[]>;
  ensurePurposeRoute(siteId: string, purpose: EmailPurpose, connectionId: string): Promise<EmailRoute[]>;
  replacePurposeRoutes(siteId: string, purpose: EmailPurpose, connectionIds: readonly string[]): Promise<EmailRoute[]>;
  resolvePurposeConnections(siteId: string, purpose: EmailPurpose): Promise<EmailConnection[]>;
  enqueueDelivery(input: DeliveryInsert): Promise<{ delivery: EmailDelivery; created: boolean }>;
  getDelivery(siteId: string, id: string): Promise<EmailDelivery | null>;
  listDeliveries(siteId: string, query: DeliveryListQuery): Promise<PaginatedDeliveries>;
  claimDelivery(siteId: string, id: string, now: string, leaseToken: string, leaseExpiresAt: string): Promise<EmailDelivery | null>;
  appendAttempt(input: EmailAttempt): Promise<void>;
  listAttempts(siteId: string, deliveryId: string): Promise<EmailAttempt[]>;
  completeAccepted(siteId: string, id: string, leaseToken: string, disposition: string, connectionId: string, messageId: string | null, subject: string, now: string): Promise<boolean>;
  scheduleRetry(siteId: string, id: string, leaseToken: string, connectionId: string, code: string, message: string, nextAt: string, now: string): Promise<boolean>;
  completePermanentFailure(siteId: string, id: string, leaseToken: string, connectionId: string | null, code: string, message: string, now: string, purgeAt: string): Promise<boolean>;
  cancelPending(siteId: string, id: string, now: string): Promise<boolean>;
  retryFailed(siteId: string, id: string, now: string): Promise<EmailDelivery | null>;
  findRecoverableDeliveries(now: string, limit: number): Promise<EmailDelivery[]>;
  recoverExpiredLeases(now: string): Promise<number>;
  failQueueExhausted(siteId: string, id: string, now: string, purgeAt: string): Promise<boolean>;
  purgeExpiredPayloads(now: string, limit: number): Promise<number>;
  purgeExpiredMetadata(now: string, limit: number): Promise<number>;
  getOverview(siteId: string): Promise<Record<string, number>>;
  getManagedKey(keyId: string): Promise<ManagedEmailKey | null>;
  getOrCreateManagedKey(keyId: string, keyBase64: string): Promise<ManagedEmailKey>;
}

export class SqlEmailRepository implements EmailRepository {
  constructor(private readonly sql: EmailSqlExecutor) {}
  private async one<T>(sql: string, params: readonly unknown[], map: (row: unknown) => T): Promise<T | null> { const rows = await this.sql.all(sql, params); return rows[0] === undefined ? null : map(rows[0]); }

  async listConnections(siteId: string) { return (await this.sql.all("SELECT * FROM aria_email_connections WHERE site_id = ? ORDER BY name", [siteId])).map(connectionFromRow); }
  async getConnection(siteId: string, id: string) { return this.one("SELECT * FROM aria_email_connections WHERE site_id = ? AND id = ?", [siteId, id], connectionFromRow); }
  async createConnection(i: ConnectionInsert) {
    await this.sql.run(`INSERT INTO aria_email_connections (id,site_id,name,provider,enabled,from_email,from_name,reply_to_email,config_json,credential_state,health_state,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,'missing','untested',?,?,?,?)`, [i.id,i.siteId,i.name,i.provider,i.enabled?1:0,i.fromEmail,i.fromName,i.replyToEmail,JSON.stringify(i.config),i.createdAt,i.updatedAt,i.createdByUserId,i.updatedByUserId]);
    const row = await this.getConnection(i.siteId, i.id); if (!row) throw new Error("EMAIL_CONNECTION_INSERT_FAILED"); return row;
  }
  async updateConnection(siteId: string, id: string, i: Pick<EmailConnection,"name"|"enabled"|"fromEmail"|"fromName"|"replyToEmail"|"config"|"updatedByUserId">) {
    await this.sql.run("UPDATE aria_email_connections SET name=?,enabled=?,from_email=?,from_name=?,reply_to_email=?,config_json=?,updated_by_user_id=?,updated_at=? WHERE site_id=? AND id=?", [i.name,i.enabled?1:0,i.fromEmail,i.fromName,i.replyToEmail,JSON.stringify(i.config),i.updatedByUserId,new Date().toISOString(),siteId,id]); return this.getConnection(siteId,id);
  }
  async saveConnectionSecret(siteId: string, connectionId: string, e: EncryptedEnvelope) { const now=new Date().toISOString(); await this.sql.run("INSERT INTO aria_email_connection_secrets (connection_id,site_id,ciphertext_base64,iv_base64,key_id,algorithm,created_at,rotated_at) VALUES (?,?,?,?,?,'AES-256-GCM',?,NULL) ON CONFLICT(connection_id) DO UPDATE SET ciphertext_base64=excluded.ciphertext_base64,iv_base64=excluded.iv_base64,key_id=excluded.key_id,rotated_at=excluded.created_at",[connectionId,siteId,e.ciphertextBase64,e.ivBase64,e.keyId,now]); await this.sql.run("UPDATE aria_email_connections SET credential_state='configured',updated_at=? WHERE site_id=? AND id=?",[now,siteId,connectionId]); }
  async getConnectionSecret(siteId: string, connectionId: string) { return this.one("SELECT * FROM aria_email_connection_secrets WHERE site_id=? AND connection_id=?",[siteId,connectionId],(input)=>{const r=DbRowSchema.parse(input); return EncryptedEnvelopeSchema.parse({ciphertextBase64:r.ciphertext_base64,ivBase64:r.iv_base64,keyId:r.key_id,algorithm:r.algorithm});}); }
  async updateConnectionHealth(siteId:string,id:string,state:"healthy"|"degraded"|"failed",code?:string,message?:string){await this.sql.run("UPDATE aria_email_connections SET health_state=?,last_checked_at=?,last_error_code=?,last_error_message=?,credential_state=CASE WHEN ?='failed' THEN 'invalid' ELSE credential_state END,updated_at=? WHERE site_id=? AND id=?",[state,new Date().toISOString(),code??null,message?.slice(0,500)??null,state,new Date().toISOString(),siteId,id]);}
  async deleteConnection(siteId:string,id:string){try{const r=await this.sql.run("DELETE FROM aria_email_connections WHERE site_id=? AND id=?",[siteId,id]);return r.changes>0;}catch{return false;}}
  async listRoutes(siteId:string){return (await this.sql.all("SELECT * FROM aria_email_routes WHERE site_id=? ORDER BY purpose,priority",[siteId])).map(routeFromRow);}
  async ensurePurposeRoute(siteId:string,purpose:EmailPurpose,connectionId:string){const now=new Date().toISOString();await this.sql.run("INSERT INTO aria_email_routes (id,site_id,purpose,connection_id,priority,enabled,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM aria_email_routes WHERE site_id=? AND purpose=?)",[crypto.randomUUID(),siteId,purpose,connectionId,0,now,now,siteId,purpose]);return (await this.listRoutes(siteId)).filter((route)=>route.purpose===purpose);}
  async replacePurposeRoutes(siteId:string,purpose:EmailPurpose,ids:readonly string[]){await this.sql.run("DELETE FROM aria_email_routes WHERE site_id=? AND purpose=?",[siteId,purpose]);const now=new Date().toISOString();for(let priority=0;priority<ids.length;priority++){await this.sql.run("INSERT INTO aria_email_routes (id,site_id,purpose,connection_id,priority,enabled,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)",[crypto.randomUUID(),siteId,purpose,ids[priority],priority,now,now]);}return (await this.listRoutes(siteId)).filter((route)=>route.purpose===purpose);}
  async resolvePurposeConnections(siteId:string,purpose:EmailPurpose){return (await this.sql.all("SELECT c.* FROM aria_email_routes r JOIN aria_email_connections c ON c.id=r.connection_id AND c.site_id=r.site_id WHERE r.site_id=? AND r.purpose=? AND r.enabled=1 AND c.enabled=1 ORDER BY r.priority",[siteId,purpose])).map(connectionFromRow);}
  async enqueueDelivery(i:DeliveryInsert){const p=i.payload;const r=await this.sql.run(`INSERT OR IGNORE INTO aria_email_deliveries (id,site_id,purpose,template_key,template_version,status,connection_id,to_json,cc_json,bcc_json,payload_ciphertext_base64,payload_iv_base64,payload_key_id,idempotency_key,max_attempts,next_attempt_at,created_by_user_id,created_at,updated_at,payload_purge_at,metadata_purge_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[i.id,i.siteId,i.purpose,i.templateKey,i.templateVersion,i.connectionId??null,JSON.stringify(i.to),JSON.stringify(i.cc),JSON.stringify(i.bcc),p?.ciphertextBase64??null,p?.ivBase64??null,p?.keyId??null,i.idempotencyKey,i.maxAttempts,i.nextAttemptAt,i.createdByUserId,i.createdAt,i.updatedAt,i.payloadPurgeAt,i.metadataPurgeAt]);const d=await this.one("SELECT * FROM aria_email_deliveries WHERE site_id=? AND idempotency_key=?",[i.siteId,i.idempotencyKey],deliveryFromRow);if(!d)throw new Error("EMAIL_DELIVERY_INSERT_FAILED");return{delivery:d,created:r.changes>0};}
  async getDelivery(siteId:string,id:string){return this.one("SELECT * FROM aria_email_deliveries WHERE site_id=? AND id=?",[siteId,id],deliveryFromRow);}
  async listDeliveries(siteId:string,q:DeliveryListQuery){const query=DeliveryListQuerySchema.parse(q);const clauses=["site_id=?"],params:unknown[]=[siteId];if(query.status){clauses.push("status=?");params.push(query.status);}if(query.purpose){clauses.push("purpose=?");params.push(query.purpose);}if(query.connectionId){clauses.push("connection_id=?");params.push(query.connectionId);}if(query.cursor){clauses.push("created_at<?");params.push(query.cursor);}params.push(query.limit+1);const rows=(await this.sql.all(`SELECT * FROM aria_email_deliveries WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`,params)).map(deliveryFromRow);const more=rows.length>query.limit;const items=rows.slice(0,query.limit);return{items,nextCursor:more?items.at(-1)?.createdAt??null:null};}
  async claimDelivery(siteId:string,id:string,now:string,token:string,expires:string){await this.sql.run("UPDATE aria_email_deliveries SET status='processing',lease_token=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=? WHERE site_id=? AND id=? AND status IN ('pending','retry_scheduled') AND next_attempt_at<=? AND (lease_expires_at IS NULL OR lease_expires_at<=?)",[token,expires,now,siteId,id,now,now]);return this.one("SELECT * FROM aria_email_deliveries WHERE site_id=? AND id=? AND lease_token=?",[siteId,id,token],deliveryFromRow);}
  async appendAttempt(a:EmailAttempt){await this.sql.run("INSERT INTO aria_email_attempts (id,site_id,delivery_id,connection_id,attempt_number,outcome,error_class,error_code,error_message,provider_message_id,provider_response_json,latency_ms,started_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[a.id,a.siteId,a.deliveryId,a.connectionId,a.attemptNumber,a.outcome,a.errorClass,a.errorCode,a.errorMessage,a.providerMessageId,a.providerResponse?JSON.stringify(a.providerResponse):null,a.latencyMs,a.startedAt,a.finishedAt]);}
  async listAttempts(siteId:string,deliveryId:string){return (await this.sql.all("SELECT * FROM aria_email_attempts WHERE site_id=? AND delivery_id=? ORDER BY attempt_number",[siteId,deliveryId])).map(attemptFromRow);}
  async completeAccepted(siteId:string,id:string,token:string,disposition:string,connectionId:string,messageId:string|null,subject:string,now:string){const r=await this.sql.run("UPDATE aria_email_deliveries SET status='accepted',provider_disposition=?,connection_id=?,provider_message_id=?,subject=?,accepted_at=?,terminal_at=?,payload_ciphertext_base64=NULL,payload_iv_base64=NULL,payload_key_id=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE site_id=? AND id=? AND lease_token=?",[disposition,connectionId,messageId,subject,now,now,now,siteId,id,token]);return r.changes>0;}
  async scheduleRetry(siteId:string,id:string,token:string,connectionId:string,code:string,message:string,nextAt:string,now:string){const r=await this.sql.run("UPDATE aria_email_deliveries SET status='retry_scheduled',connection_id=?,last_error_code=?,last_error_message=?,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE site_id=? AND id=? AND lease_token=?",[connectionId,code,message.slice(0,500),nextAt,now,siteId,id,token]);return r.changes>0;}
  async completePermanentFailure(siteId:string,id:string,token:string,connectionId:string|null,code:string,message:string,now:string,purgeAt:string){const r=await this.sql.run("UPDATE aria_email_deliveries SET status='failed_permanent',connection_id=?,last_error_code=?,last_error_message=?,terminal_at=?,payload_purge_at=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE site_id=? AND id=? AND lease_token=?",[connectionId,code,message.slice(0,500),now,purgeAt,now,siteId,id,token]);return r.changes>0;}
  async cancelPending(siteId:string,id:string,now:string){const r=await this.sql.run("UPDATE aria_email_deliveries SET status='canceled',terminal_at=?,payload_ciphertext_base64=NULL,payload_iv_base64=NULL,payload_key_id=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE site_id=? AND id=? AND status IN ('pending','retry_scheduled')",[now,now,siteId,id]);return r.changes>0;}
  async retryFailed(siteId:string,id:string,now:string){await this.sql.run("UPDATE aria_email_deliveries SET status='pending',attempt_count=0,next_attempt_at=?,terminal_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=? WHERE site_id=? AND id=? AND status='failed_permanent' AND payload_ciphertext_base64 IS NOT NULL",[now,now,siteId,id]);return this.getDelivery(siteId,id);}
  async findRecoverableDeliveries(now:string,limit:number){return (await this.sql.all("SELECT * FROM aria_email_deliveries WHERE status IN ('pending','retry_scheduled') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?",[now,Math.min(Math.max(limit,1),100)])).map(deliveryFromRow);}
  async recoverExpiredLeases(now:string){return (await this.sql.run("UPDATE aria_email_deliveries SET status='retry_scheduled',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=?,updated_at=? WHERE status='processing' AND lease_expires_at<=?",[now,now,now])).changes;}
  async failQueueExhausted(siteId:string,id:string,now:string,purgeAt:string){const result=await this.sql.run("UPDATE aria_email_deliveries SET status='failed_permanent',last_error_code='QUEUE_RETRIES_EXHAUSTED',last_error_message='Queue retries exhausted',terminal_at=?,payload_purge_at=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE site_id=? AND id=? AND status IN ('pending','processing','retry_scheduled')",[now,purgeAt,now,siteId,id]);return result.changes>0;}
  async purgeExpiredPayloads(now:string,limit:number){return (await this.sql.run("UPDATE aria_email_deliveries SET payload_ciphertext_base64=NULL,payload_iv_base64=NULL,payload_key_id=NULL,updated_at=? WHERE id IN (SELECT id FROM aria_email_deliveries WHERE payload_purge_at IS NOT NULL AND payload_purge_at<=? LIMIT ?)",[now,now,Math.min(limit,1000)])).changes;}
  async purgeExpiredMetadata(now:string,limit:number){return (await this.sql.run("DELETE FROM aria_email_deliveries WHERE id IN (SELECT id FROM aria_email_deliveries WHERE metadata_purge_at<=? LIMIT ?)",[now,Math.min(limit,1000)])).changes;}
  async getOverview(siteId:string){const rows=await this.sql.all("SELECT status,COUNT(*) AS count FROM aria_email_deliveries WHERE site_id=? GROUP BY status",[siteId]);const result:Record<string,number>={};for(const input of rows){const r=DbRowSchema.parse(input);result[z.string().parse(r.status)]=z.int().nonnegative().parse(r.count);}return result;}
  async getManagedKey(keyId:string){return this.one("SELECT * FROM aria_email_keyring WHERE key_id=?",[keyId],(input)=>{const r=DbRowSchema.parse(input);return{keyId:z.string().parse(r.key_id),keyBase64:z.string().parse(r.key_base64)};});}
  async getOrCreateManagedKey(keyId:string,keyBase64:string){const now=new Date().toISOString();await this.sql.run("INSERT OR IGNORE INTO aria_email_keyring (key_id,key_base64,source,created_at) VALUES (?,?,'managed-d1',?)",[keyId,keyBase64,now]);const key=await this.getManagedKey(keyId);if(!key)throw new Error("EMAIL_MANAGED_KEY_UNAVAILABLE");return key;}
}
