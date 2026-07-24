import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};
export const ariaEmailConnections = sqliteTable(
  "aria_email_connections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().default("default"),
    name: text("name").notNull(),
    provider: text("provider", {
      enum: ["cloudflare_email", "smtp", "preview"],
    }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    replyToEmail: text("reply_to_email"),
    configJson: text("config_json").notNull(),
    credentialState: text("credential_state", {
      enum: ["missing", "configured", "invalid"],
    })
      .notNull()
      .default("missing"),
    healthState: text("health_state", {
      enum: ["untested", "healthy", "degraded", "failed"],
    })
      .notNull()
      .default("untested"),
    lastCheckedAt: text("last_checked_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
    createdByUserId: text("created_by_user_id"),
    updatedByUserId: text("updated_by_user_id"),
  },
  (table) => [
    uniqueIndex("uq_email_connections_site_name").on(
      table.siteId,
      table.name,
    ),
    index("idx_email_connections_site_provider").on(
      table.siteId,
      table.provider,
      table.enabled,
    ),
  ],
);
export const ariaEmailConnectionSecrets = sqliteTable(
  "aria_email_connection_secrets",
  {
    connectionId: text("connection_id")
      .primaryKey()
      .references(() => ariaEmailConnections.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull().default("default"),
    ciphertextBase64: text("ciphertext_base64").notNull(),
    ivBase64: text("iv_base64").notNull(),
    keyId: text("key_id").notNull(),
    algorithm: text("algorithm").notNull(),
    createdAt: text("created_at").notNull(),
    rotatedAt: text("rotated_at"),
  },
  (table) => [
    uniqueIndex("uq_email_secrets_site_connection").on(
      table.siteId,
      table.connectionId,
    ),
  ],
);
export const ariaEmailRoutes = sqliteTable(
  "aria_email_routes",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().default("default"),
    purpose: text("purpose", { enum: ["system", "forms"] }).notNull(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => ariaEmailConnections.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex(
      "uq_email_routes_site_purpose_connection",
    ).on(table.siteId, table.purpose, table.connectionId),
    index("idx_email_routes_site_purpose").on(
      table.siteId,
      table.purpose,
      table.enabled,
      table.priority,
    ),
  ],
);
export const ariaEmailDeliveries = sqliteTable(
  "aria_email_deliveries",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().default("default"),
    purpose: text("purpose", { enum: ["system", "forms"] }).notNull(),
    templateKey: text("template_key").notNull(),
    templateVersion: integer("template_version").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "processing",
        "retry_scheduled",
        "accepted",
        "failed_permanent",
        "canceled",
      ],
    }).notNull(),
    providerDisposition: text("provider_disposition"),
    connectionId: text("connection_id").references(
      () => ariaEmailConnections.id,
      { onDelete: "set null" },
    ),
    toJson: text("to_json").notNull(),
    ccJson: text("cc_json").notNull().default("[]"),
    bccJson: text("bcc_json").notNull().default("[]"),
    subject: text("subject"),
    payloadCiphertextBase64: text("payload_ciphertext_base64"),
    payloadIvBase64: text("payload_iv_base64"),
    payloadKeyId: text("payload_key_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: text("next_attempt_at").notNull(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    providerMessageId: text("provider_message_id"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
    acceptedAt: text("accepted_at"),
    terminalAt: text("terminal_at"),
    payloadPurgeAt: text("payload_purge_at"),
    metadataPurgeAt: text("metadata_purge_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_email_deliveries_site_idempotency").on(
      table.siteId,
      table.idempotencyKey,
    ),
    index("idx_email_deliveries_due").on(
      table.siteId,
      table.status,
      table.nextAttemptAt,
    ),
    index("idx_email_deliveries_created").on(
      table.siteId,
      table.createdAt,
      table.id,
    ),
  ],
);
export const ariaEmailAttempts = sqliteTable(
  "aria_email_attempts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull().default("default"),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => ariaEmailDeliveries.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => ariaEmailConnections.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: text("outcome", {
      enum: [
        "accepted",
        "queued_by_provider",
        "transient_failure",
        "permanent_failure",
      ],
    }).notNull(),
    errorClass: text("error_class"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerMessageId: text("provider_message_id"),
    providerResponseJson: text("provider_response_json"),
    latencyMs: integer("latency_ms"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
  },
  (table) => [
    uniqueIndex(
      "uq_email_attempts_site_delivery_number",
    ).on(table.siteId, table.deliveryId, table.attemptNumber),
    index("idx_email_attempts_delivery").on(
      table.siteId,
      table.deliveryId,
      table.attemptNumber,
    ),
  ],
);
