#!/usr/bin/env node
/**
 * Promote canonical content (and optionally media/auth) from local SQLite to D1 / R2.
 */

import { createClient } from "@libsql/client";
import { resolve } from "node:path";

import {
  assertRemoteAuthPushAllowed,
  createAuthPushTarget,
  pushAuthFromLocalDb,
} from "../lib/auth/push-auth";
import { DefaultContentSyncPlanner } from "../lib/content-sync/service/default-planner";
import { DEFAULT_CONTENT_SYNC_RESOURCE_TYPES } from "../lib/content-sync/service/planner";
import { ContentSyncExecutor } from "../lib/content-sync/service/executor";
import type {
  ContentSyncHistoryItem,
  ContentSyncJob,
  ContentSyncPlanItem,
} from "../lib/content-sync/schema";
import { runCliMediaSync } from "../lib/push/run-cli-media-sync";
import { loadDotenv } from "../lib/storage/load-dotenv";
import { buildReplaceClearStatements } from "../lib/storage/push-canonical-clear";
import {
  assertNoPushValidationErrors,
  validateDslJsonPayload,
  type PushValidationIssue,
} from "../lib/storage/push-validation";
import { createRemoteD1Database } from "../lib/storage/remote-d1";
import { resolveLocalWranglerD1SqlitePath } from "../lib/storage/wrangler-config";
import { applyD1Migrations } from "./apply-d1-migrations";
import { isMainModule } from "./lib/node-command";

const LOCAL_DB_PATH = resolve(process.cwd(), "aria/storage/aria.db");
const DATABASE_BINDING = process.env.ARIA_D1_BINDING || "aria_db";

type CliOptions = {
  local: boolean;
  dryRun: boolean;
  replace: boolean;
  withMedia: boolean;
  withAuth: boolean;
  conflictPolicy: "newest-wins" | "local-wins" | "remote-wins";
};

/** Parses content-push command arguments into validated options. */
function parseCliOptions(argv: string[]): CliOptions {
  let conflictPolicy: CliOptions["conflictPolicy"] = "newest-wins";
  if (argv.includes("--local-wins")) {
    conflictPolicy = "local-wins";
  }
  if (argv.includes("--remote-wins")) {
    conflictPolicy = "remote-wins";
  }

  const local = argv.includes("--local") || process.env.ARIA_D1_LOCAL === "1";

  if (local && conflictPolicy === "newest-wins") {
    conflictPolicy = "local-wins";
  }

  return {
    local,
    dryRun: argv.includes("--dry-run"),
    replace: argv.includes("--replace"),
    withMedia: argv.includes("--with-media"),
    withAuth: argv.includes("--with-auth"),
    conflictPolicy,
  };
}

/** Converts a planned content change into a sync-history item. */
function planItemToHistoryItem(
  item: ContentSyncPlanItem,
  jobId: string,
): ContentSyncHistoryItem {
  const createdAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    jobId,
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    resourceLabel: item.resourceLabel,
    action: item.action,
    localVersion: item.localVersion,
    remoteVersion: item.remoteVersion,
    localChecksum: item.localChecksum,
    remoteChecksum: item.remoteChecksum,
    resultStatus:
      item.action === "conflict"
        ? "conflicted"
        : item.action === "skip"
          ? "skipped"
          : "planned",
    conflictReason: item.action === "conflict" ? item.reason : undefined,
    createdAt,
  };
}

// Push tooling reads/writes existing databases and must never trigger
// lazy starter-content seeding as a side effect (it could silently inject
// unrelated pages/collections into a source db, or collide with content
// the sync executor is about to write to a target db).
const NO_STARTER_SEED_OPTIONS = {
  seedStarterLayouts: false,
  seedStarterPages: false,
  seedStarterCms: false,
  seedStarterDesign: false,
  seedStarterSiteSettings: false,
} as const;

/** Opens the local storage adapter used as the content-push source. */
async function createLocalSourceAdapter() {
  const { SQLiteStorageAdapter } = await import("../lib/storage/sqlite");
  const client = createClient({ url: `file:${LOCAL_DB_PATH}` });
  return new SQLiteStorageAdapter(client, NO_STARTER_SEED_OPTIONS);
}

/** Creates the local or remote storage adapter used as the push target. */
async function createPushTargetAdapter(options: CliOptions) {
  if (options.local) {
    const sqlitePath = resolveLocalWranglerD1SqlitePath();

    if (!sqlitePath) {
      throw new Error(
        "Local wrangler D1 database was not found. Run `npm run db:migrate:local` first.",
      );
    }

    const { SQLiteStorageAdapter } = await import("../lib/storage/sqlite");
    const client = createClient({ url: `file:${sqlitePath}` });
    return new SQLiteStorageAdapter(client, NO_STARTER_SEED_OPTIONS);
  }

  const { CloudflareStorageAdapter } =
    await import("../lib/storage/cloudflare");
  const d1 = await createRemoteD1Database(DATABASE_BINDING, { remote: true });

  return new CloudflareStorageAdapter({
    aria_db: d1 as any,
  });
}

/** Applies migrations to the selected content-push target. */
async function applyMigrations(options: CliOptions) {
  await applyD1Migrations(options.local ? "local" : "remote");
}

/** Clears replaceable target data before a full content replacement. */
async function clearTargetForReplace(options: CliOptions) {
  const statements = buildReplaceClearStatements();

  if (options.local) {
    const sqlitePath = resolveLocalWranglerD1SqlitePath();
    if (!sqlitePath) {
      throw new Error(
        "Local wrangler D1 database was not found for --replace.",
      );
    }

    const client = createClient({ url: `file:${sqlitePath}` });
    await client.execute("PRAGMA foreign_keys = OFF");

    for (const statement of statements) {
      await client.execute(statement.sql);
    }

    await client.execute("PRAGMA foreign_keys = ON");
    return;
  }

  const d1 = await createRemoteD1Database(DATABASE_BINDING, { remote: true });

  for (const statement of statements) {
    await d1.prepare(statement.sql).run();
  }
}

/** Collects local DSL validation issues before uploading content. */
async function collectLocalDslValidationIssues(): Promise<
  PushValidationIssue[]
> {
  const localAdapter = await createLocalSourceAdapter();
  const issues: PushValidationIssue[] = [];

  const pages = await localAdapter.listPagesDSL();
  for (const page of pages) {
    const dsl = await localAdapter.getPageDSL(page.id);
    if (!dsl) {
      continue;
    }

    issues.push(
      ...validateDslJsonPayload({
        resourceType: "page",
        resourceId: page.id,
        dslJson: JSON.stringify(dsl),
      }),
    );
  }

  const layouts = await localAdapter.listLayoutsDSL({
    limit: 10_000,
    offset: 0,
  });
  for (const layout of layouts) {
    const dsl = await localAdapter.getLayoutDSL(layout.id);
    if (!dsl) {
      continue;
    }

    issues.push(
      ...validateDslJsonPayload({
        resourceType: "layout",
        resourceId: layout.id,
        dslJson: JSON.stringify(dsl),
      }),
    );
  }

  const components = await localAdapter.listComponentsDSL({
    limit: 10_000,
    offset: 0,
  });
  for (const component of components) {
    const dsl = await localAdapter.getComponentDSL(component.id);
    if (!dsl) {
      continue;
    }

    issues.push(
      ...validateDslJsonPayload({
        resourceType: "component",
        resourceId: component.id,
        dslJson: JSON.stringify(dsl),
      }),
    );
  }

  return issues;
}

/** Plans and applies the requested content push. */
async function runContentPush(options: CliOptions): Promise<{
  failed: number;
  conflicted: number;
}> {
  const localAdapter = await createLocalSourceAdapter();
  const remoteAdapter = await createPushTargetAdapter(options);

  const planner = new DefaultContentSyncPlanner();
  const createdAt = new Date().toISOString();
  const planResult = await planner.plan({
    request: {
      direction: "push",
      conflictPolicy: options.conflictPolicy,
      resourceTypes: [...DEFAULT_CONTENT_SYNC_RESOURCE_TYPES],
    },
    localAdapter,
    remoteAdapter,
    createdAt,
    notes: options.dryRun
      ? "CLI dry-run"
      : options.replace
        ? "CLI apply (--replace)"
        : "CLI apply (merge)",
  });

  const executableItems = planResult.plan.items.filter(
    (item) =>
      item.action === "create" ||
      item.action === "update" ||
      item.action === "delete",
  );

  console.log("📋 Content plan:");
  console.log(`  - total: ${planResult.plan.summary.total}`);
  console.log(`  - create: ${planResult.plan.summary.created ?? 0}`);
  console.log(`  - update: ${planResult.plan.summary.updated}`);
  console.log(`  - delete: ${planResult.plan.summary.deleted}`);
  console.log(`  - skip: ${planResult.plan.summary.skipped}`);
  console.log(`  - conflict: ${planResult.plan.summary.conflicted}`);

  if (planResult.plan.summary.conflicted > 0) {
    console.warn(
      "\n⚠ Content conflicts detected. Re-run with --local-wins or --replace (destructive).",
    );
  }

  if (options.dryRun) {
    return {
      failed: 0,
      conflicted: planResult.plan.summary.conflicted,
    };
  }

  if (executableItems.length === 0) {
    console.log("\n✅ No content changes to apply.");
    return {
      failed: 0,
      conflicted: planResult.plan.summary.conflicted,
    };
  }

  const jobId = crypto.randomUUID();
  const dryRunJob: ContentSyncJob = {
    id: jobId,
    direction: "push",
    mode: "dry-run",
    status: "completed",
    sourceEndpointId: planResult.plan.sourceEndpointId,
    targetEndpointId: planResult.plan.targetEndpointId,
    conflictPolicy: planResult.plan.conflictPolicy,
    localRevisionId: planResult.plan.localRevision?.revisionId,
    remoteRevisionId: planResult.plan.remoteRevision?.revisionId,
    createdAt,
    startedAt: createdAt,
    finishedAt: createdAt,
  };

  const dryRunItems = executableItems.map((item) =>
    planItemToHistoryItem(item, jobId),
  );

  const executor = new ContentSyncExecutor();
  const applied = await executor.apply({
    dryRunJob,
    dryRunItems,
    localAdapter,
    remoteAdapter,
  });

  const appliedCount =
    applied.summary.created + applied.summary.updated + applied.summary.deleted;

  console.log("\n✅ Content push:");
  console.log(`  - applied: ${appliedCount}`);
  console.log(`  - skipped: ${applied.summary.skipped}`);
  console.log(`  - failed: ${applied.summary.failed}`);

  const failedItems = applied.items.filter(
    (item) => item.resultStatus === "failed",
  );
  if (failedItems.length > 0) {
    console.error("\nFailed content items:");
    for (const item of failedItems) {
      console.error(
        `  - ${item.resourceType}:${item.resourceId} (${item.action}): ${item.errorMessage ?? "unknown error"}`,
      );
    }
  }

  const conflictedItems = planResult.plan.items.filter(
    (item) => item.action === "conflict",
  );
  if (conflictedItems.length > 0) {
    console.warn(
      `\n${conflictedItems.length} content conflict(s) were not pushed:`,
    );
    for (const item of conflictedItems) {
      console.warn(
        `  - ${item.resourceType}:${item.resourceId} — ${item.reason}`,
      );
    }
  }

  return {
    failed: applied.summary.failed,
    conflicted: conflictedItems.length,
  };
}

/** Parses CLI options, validates local content, and executes the push. */
async function main() {
  loadDotenv();

  const options = parseCliOptions(process.argv.slice(2));
  const targetLabel = options.local ? "local wrangler D1" : "remote D1";

  console.log(`\n📤 Pushing from aria.db → ${targetLabel}...\n`);

  const validationIssues = await collectLocalDslValidationIssues();
  const warnings = validationIssues.filter((issue) => issue.level === "warn");
  assertNoPushValidationErrors(validationIssues);

  if (warnings.length > 0) {
    const unique = [
      ...new Map(
        warnings.map((warning) => [warning.resourceId, warning] as const),
      ).values(),
    ];
    for (const warning of unique) {
      console.warn(`⚠ ${warning.message}`);
    }
  }

  await applyMigrations(options);

  if (options.replace) {
    console.log(
      "🧹 --replace: clearing target canonical content tables (not auth or content-sync metadata)...",
    );
    await clearTargetForReplace(options);
  }

  let exitFailed = 0;
  let exitConflicted = 0;

  const contentResult = await runContentPush(options);
  exitFailed += contentResult.failed;
  exitConflicted += contentResult.conflicted;

  if (options.withMedia) {
    console.log("\n📁 Media push (public/uploads → R2)...\n");
    const mediaResult = await runCliMediaSync({
      localTarget: options.local,
      conflictPolicy: options.conflictPolicy,
      dryRun: options.dryRun,
    });

    console.log("✅ Media push:");
    console.log(`  - created: ${mediaResult.summary.created}`);
    console.log(`  - updated: ${mediaResult.summary.updated}`);
    console.log(`  - deleted: ${mediaResult.summary.deleted}`);
    console.log(`  - skipped: ${mediaResult.summary.skipped}`);
    console.log(`  - conflicted: ${mediaResult.summary.conflicted}`);
    console.log(`  - failed: ${mediaResult.summary.failed}`);

    exitFailed += mediaResult.summary.failed;
    exitConflicted += mediaResult.summary.conflicted;
  }

  if (options.withAuth) {
    if (!options.local) {
      assertRemoteAuthPushAllowed();
      console.warn(
        "\n⚠ Pushing auth users to REMOTE D1 (password hashes / 2FA secrets). Sessions are never copied.\n",
      );
    }

    if (!options.dryRun) {
      console.log("\n🔐 Auth push (aria_users + aria_config)...\n");
      const authTarget = await createAuthPushTarget({ local: options.local });
      const authResult = await pushAuthFromLocalDb({
        sourceDbPath: LOCAL_DB_PATH,
        target: authTarget,
      });

      console.log("✅ Auth push:");
      console.log(`  - users: ${authResult.users}`);
      console.log(`  - passkeys: ${authResult.passkeys}`);
      console.log(`  - config keys: ${authResult.configKeys}`);
    } else {
      console.log("\n🔐 Auth push: skipped in dry-run mode.");
    }
  }

  if (options.dryRun) {
    console.log("\n✅ Dry-run complete (no changes applied).");
    return;
  }

  const treatConflictsAsFailure = !(
    options.local && options.conflictPolicy === "local-wins"
  );

  if (exitFailed > 0 || (exitConflicted > 0 && treatConflictsAsFailure)) {
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error("\n❌ Push failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
