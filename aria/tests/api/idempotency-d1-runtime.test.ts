import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";

import { runPackageBinSync } from "../../scripts/lib/node-command";

const runD1 = process.env.ARIA_D1_RUNTIME_TEST === "1";

describe.runIf(runD1)("API mutation D1 runtime", () => {
  it("rolls back a failed production batch and atomically completes its retry", async () => {
    const schema = `
      CREATE TABLE aria_entries (
        id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, status TEXT NOT NULL,
        version TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, published_at TEXT, scheduled_for TEXT,
        created_by_id TEXT, created_by_username TEXT, created_by_email TEXT,
        updated_by_id TEXT, updated_by_username TEXT, updated_by_email TEXT,
        published_by_id TEXT, published_by_username TEXT, published_by_email TEXT
      );
      CREATE TABLE aria_entry_locales (
        entry_id TEXT NOT NULL, collection_id TEXT NOT NULL, locale TEXT NOT NULL,
        slug TEXT NOT NULL, title TEXT NOT NULL, frontmatter_json TEXT NOT NULL,
        body TEXT, is_source INTEGER NOT NULL, translation_meta_json TEXT,
        comments_closed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (entry_id, locale)
      );
      CREATE TABLE aria_entry_relations (
        source_entry_id TEXT NOT NULL, field_key TEXT NOT NULL,
        target_entry_id TEXT NOT NULL, position INTEGER NOT NULL, meta_json TEXT,
        PRIMARY KEY (source_entry_id, field_key, target_entry_id)
      );
      CREATE TABLE aria_cms_entry_workflow (
        entry_id TEXT NOT NULL, locale TEXT NOT NULL, state TEXT NOT NULL,
        reviewed_version TEXT, updated_by_id TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (entry_id, locale)
      );
      CREATE TABLE aria_entry_revisions (
        id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, locale TEXT, version TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, actor_id TEXT NOT NULL, actor_username TEXT,
        actor_email TEXT, actor_avatar_url TEXT, message TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE aria_cms_audit_events (
        id TEXT PRIMARY KEY, action TEXT NOT NULL, actor_id TEXT NOT NULL,
        actor_username TEXT, collection_id TEXT, entry_id TEXT, summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE aria_api_idempotency (
        id TEXT PRIMARY KEY, credential_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        method TEXT NOT NULL, route_template TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL, state TEXT NOT NULL,
        response_status INTEGER, response_body_json TEXT, response_headers_json TEXT,
        resource_version TEXT, lease_token TEXT, lease_expires_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        UNIQUE (credential_id, idempotency_key)
      );
      CREATE TABLE aria_api_security_audit (
        id TEXT PRIMARY KEY, request_id TEXT NOT NULL, site_id TEXT, actor_id TEXT,
        credential_id TEXT, event_type TEXT NOT NULL, method TEXT, route_template TEXT,
        resource_type TEXT, resource_id TEXT, outcome TEXT NOT NULL,
        metadata_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
      );
      INSERT INTO aria_api_idempotency (
        id, credential_id, idempotency_key, method, route_template,
        request_fingerprint, state, lease_token, lease_expires_at,
        created_at, updated_at, expires_at
      ) VALUES (
        'claim-1', 'credential-1', 'd1-idempotency-key-0001', 'POST', '/entries',
        'd1-fingerprint', 'processing', 'lease-1', '2027-01-01T00:00:00.000Z',
        '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z'
      );
    `;
    const source = `
      import { cmsCommitEntryMutation } from "./aria/lib/cms/storage/entryMutation.ts";
      const schema = ${JSON.stringify(schema)};
      const record = {
        entry: {
          id: "entry-1", collectionId: "posts", status: "draft",
          version: "version-1", authorId: "user-1",
          createdAt: "2026-07-19T00:00:01.000Z",
          updatedAt: "2026-07-19T00:00:01.000Z",
          publishedAt: null, scheduledFor: null
        },
        locales: [{
          entryId: "entry-1", collectionId: "posts", locale: "en",
          slug: "d1-entry", title: "D1 entry", frontmatter: {}, body: null,
          isSource: true, commentsClosed: false
        }],
        relations: [],
        authorship: {
          author: { id: "user-1", username: "d1-user" },
          createdBy: { id: "user-1", username: "d1-user" },
          updatedBy: { id: "user-1", username: "d1-user" },
          publishedBy: null
        }
      };
      const input = {
        record,
        relations: [],
        revision: {
          id: "revision-1", entryId: "entry-1", locale: "en",
          version: "version-1",
          snapshot: { entry: record.entry, locales: record.locales, relations: [] },
          actorId: "user-1", message: "Created entry",
          createdAt: "2026-07-19T00:00:01.000Z",
          authorship: { actor: { id: "user-1", username: "d1-user" } }
        },
        auditEvent: {
          id: "audit-1", action: "entry.create", actorId: "user-1",
          actorUsername: "d1-user", collectionId: "posts", entryId: "entry-1",
          summary: "Created CMS entry", metadata: {},
          createdAt: "2026-07-19T00:00:01.000Z"
        },
        api: {
          credentialId: "credential-1", key: "d1-idempotency-key-0001",
          fingerprint: "d1-fingerprint", leaseToken: "lease-1",
          committedAt: "2026-07-19T00:00:01.000Z",
          response: {
            status: 201, body: { success: true, data: record },
            headers: { ETag: "\\\"aria-entry-version-1\\\"" },
            resourceVersion: "\\\"aria-entry-version-1\\\""
          },
          securityAudit: {
            id: "security-1", requestId: "request-1", siteId: "site-1",
            actorId: "user-1", credentialId: "credential-1",
            eventType: "mutation", method: "POST", routeTemplate: "/entries",
            outcome: "success", metadataJson: "{\\\"status\\\":201}",
            createdAt: "2026-07-19T00:00:01.000Z",
            expiresAt: "2026-10-17T00:00:01.000Z"
          }
        }
      };
      const executorFor = (db, fail) => ({
        queryAll: async (sql, args = []) => (await db.prepare(sql).bind(...args).all()).results ?? [],
        queryFirst: (sql, args = []) => db.prepare(sql).bind(...args).first(),
        run: async (sql, args = []) => { await db.prepare(sql).bind(...args).run(); },
        batch: async (statements) => {
          const prepared = statements.map((statement) =>
            db.prepare(statement.sql).bind(...(statement.args ?? []))
          );
          if (fail) prepared.splice(4, 0, db.prepare("INSERT INTO missing_fault_table VALUES (1)"));
          await db.batch(prepared);
        }
      });
      const count = async (db, table) => Number(
        (await db.prepare("SELECT COUNT(*) AS count FROM " + table).first()).count
      );
      export default {
        async fetch(_request, env) {
          for (const statement of schema.split(";").map((sql) => sql.trim()).filter(Boolean)) {
            await env.DB.prepare(statement).run();
          }
          let faulted = false;
          try { await cmsCommitEntryMutation(executorFor(env.DB, true), input); }
          catch { faulted = true; }
          const rolledBack = await count(env.DB, "aria_entries") === 0;
          await cmsCommitEntryMutation(executorFor(env.DB, false), input);
          const state = await env.DB.prepare(
            "SELECT state, response_status FROM aria_api_idempotency WHERE id = 'claim-1'"
          ).first();
          return Response.json({
            faulted, rolledBack, state,
            entries: await count(env.DB, "aria_entries"),
            revisions: await count(env.DB, "aria_entry_revisions"),
            cmsAudits: await count(env.DB, "aria_cms_audit_events"),
            securityAudits: await count(env.DB, "aria_api_security_audit")
          });
        }
      };
    `;
    const script = runPackageBinSync(
      "esbuild",
      "esbuild",
      [
        "--bundle",
        "--format=esm",
        "--platform=browser",
        "--target=es2022",
        "--loader=ts",
        "--log-level=warning",
      ],
      {
        cwd: process.cwd(),
        input: source,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).stdout;
    if (!script.trim())
      throw new Error("D1 test Worker bundle was not generated");
    const miniflare = new Miniflare({
      modules: true,
      script,
      compatibilityDate: "2026-06-24",
      d1Databases: { DB: `aria-api-atomic-${crypto.randomUUID()}` },
    });
    try {
      const response = await miniflare.dispatchFetch("http://aria.test/");
      const responseText = await response.text();
      expect(response.status, responseText).toBe(200);
      expect(JSON.parse(responseText)).toEqual({
        faulted: true,
        rolledBack: true,
        state: { state: "completed", response_status: 201 },
        entries: 1,
        revisions: 1,
        cmsAudits: 1,
        securityAudits: 1,
      });
    } finally {
      await miniflare.dispose();
    }
  }, 30_000);
});
