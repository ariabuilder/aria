import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";
import { SQLiteStorageAdapter } from "../../../../lib/storage/sqlite";
import type { BuilderNode, PageDSL } from "../../../../lib/types/nodes";

export const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

export const adminUser: SessionUser = {
  id: TEST_USER_ID,
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

export const contributorUser: SessionUser = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  username: "contributor",
  email: "contributor@example.com",
  role: "contributor",
  totpEnabled: false,
  preferences: {},
};

export let harnessAdapter: SQLiteStorageAdapter | null = null;
export let harnessClient: Client | null = null;
export let harnessDbDir: string | null = null;

export async function setupHarnessAdapter(): Promise<SQLiteStorageAdapter> {
  const dbDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-agent-cms-"));
  const dbPath = path.join(dbDir, "cms.sqlite");
  const client = createClient({ url: `file:${dbPath}` });
  const adapter = new SQLiteStorageAdapter(client, {
    seedStarterLayouts: false,
    seedStarterPages: false,
    seedStarterCms: false,
    seedStarterDesign: false,
    seedStarterSiteSettings: false,
  });
  harnessAdapter = adapter;
  harnessClient = client;
  harnessDbDir = dbDir;
  return adapter;
}

export async function teardownHarnessAdapter(): Promise<void> {
  harnessClient?.close();
  harnessClient = null;
  harnessAdapter = null;
  if (harnessDbDir) {
    await fs.rm(harnessDbDir, { recursive: true, force: true });
    harnessDbDir = null;
  }
}

export function createAgentContext(
  user: SessionUser = adminUser,
): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user,
  };
}

export function buildHeroBindPage(input: {
  pageId: string;
  slug: string;
  title?: string;
}): PageDSL {
  const heroTitle: BuilderNode = {
    id: "hero-title",
    type: "Text",
    props: { text: "Placeholder" },
    styles: {},
    children: [],
  };
  const heroImage: BuilderNode = {
    id: "hero-image",
    type: "Image",
    props: { src: "/placeholder.png", alt: "" },
    styles: {},
    children: [],
  };
  const postCard: BuilderNode = {
    id: "post-card-title",
    type: "Text",
    props: { text: "Post" },
    styles: {},
    children: [],
  };
  const latestPosts: BuilderNode = {
    id: "latest-posts",
    type: "Container",
    props: {},
    styles: {},
    children: [postCard],
  };
  const root: BuilderNode = {
    id: `${input.pageId}-root`,
    type: "Container",
    props: {},
    styles: {},
    children: [heroTitle, heroImage, latestPosts],
  };

  return {
    id: input.pageId,
    title: input.title ?? "Home",
    slug: input.slug,
    description: "",
    layout: "default",
    status: "draft",
    nodes: [root],
    settings: {
      cssVariables: {},
      breakpoints: [],
    },
  };
}

export function buildLoopTemplatePage(input: {
  pageId: string;
  slug: string;
}): PageDSL {
  const cardTitle: BuilderNode = {
    id: "card-title",
    type: "Text",
    props: { text: "Title" },
    styles: {},
    children: [],
  };
  const loopContainer: BuilderNode = {
    id: "posts-loop",
    type: "Container",
    props: {},
    styles: {},
    children: [cardTitle],
  };
  const root: BuilderNode = {
    id: `${input.pageId}-root`,
    type: "Container",
    props: {},
    styles: {},
    children: [loopContainer],
  };

  return {
    id: input.pageId,
    title: "Posts",
    slug: input.slug,
    description: "",
    layout: "default",
    status: "draft",
    nodes: [root],
    settings: {
      cssVariables: {},
      breakpoints: [],
    },
  };
}
