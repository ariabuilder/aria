import { describe, expect, it } from "vitest";

import {
  deriveAssetAuthorship,
  fromLegacyAuthorProjection,
  LegacyAuthorProjectionSchema,
  toLegacyAuthorProjection,
} from "../../../lib/authorship/projections";
import {
  formatActorDisplayName,
  hydratePageDslAuthorship,
  mergeAuthorshipWithLegacyDsl,
} from "../../../lib/authorship/reads";
import { toPageInventoryAuthorship } from "../../../lib/authorship/schemas";
import type { PageDSL } from "../../../lib/types/nodes";

describe("legacy author projections", () => {
  it("round-trips ActorRef through legacy author shape", () => {
    const actor = {
      id: "user-1",
      username: "andy",
      email: "andy@example.com",
    };

    const legacy = toLegacyAuthorProjection(actor);
    expect(LegacyAuthorProjectionSchema.parse(legacy)).toEqual({
      id: "user-1",
      name: "andy",
      email: "andy@example.com",
    });

    expect(fromLegacyAuthorProjection(legacy)).toEqual(actor);
  });

  it("maps username-only actors", () => {
    const legacy = toLegacyAuthorProjection({ id: "user-2", username: "dev" });
    expect(fromLegacyAuthorProjection(legacy)).toEqual({
      id: "user-2",
      username: "dev",
    });
  });
});

describe("deriveAssetAuthorship", () => {
  it("derives create, update, and publish actors from version slices", () => {
    const authorship = deriveAssetAuthorship({
      currentVersion: "3",
      publishedVersion: "2",
      versions: [
        {
          version: "1",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: { id: "creator", username: "Creator" },
        },
        {
          version: "2",
          createdAt: "2026-01-02T00:00:00.000Z",
          createdBy: { id: "publisher", username: "Publisher" },
        },
        {
          version: "3",
          createdAt: "2026-01-03T00:00:00.000Z",
          createdBy: { id: "editor", username: "Editor" },
        },
      ],
    });

    expect(authorship.createdBy?.id).toBe("creator");
    expect(authorship.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(authorship.updatedBy?.id).toBe("editor");
    expect(authorship.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(authorship.publishedBy?.id).toBe("publisher");
    expect(authorship.publishedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("falls back to latest version when currentVersion is missing", () => {
    const authorship = deriveAssetAuthorship({
      versions: [
        {
          version: "1",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: { id: "creator" },
        },
        {
          version: "2",
          createdAt: "2026-01-02T00:00:00.000Z",
          createdBy: { id: "editor", username: "Editor" },
        },
      ],
    });

    expect(authorship.updatedBy?.id).toBe("editor");
  });

  it("returns empty envelope when no versions exist", () => {
    expect(deriveAssetAuthorship({ versions: [] })).toEqual({});
  });
});

describe("mergeAuthorshipWithLegacyDsl", () => {
  it("fills missing canonical fields from legacy DSL", () => {
    const merged = mergeAuthorshipWithLegacyDsl(
      { updatedBy: { id: "editor", username: "Editor" } },
      {
        author: { id: "legacy-creator", name: "Legacy" },
        createdAt: "2025-12-01T00:00:00.000Z",
        updatedAt: "2025-12-02T00:00:00.000Z",
        assignedTo: "user-9",
      },
    );

    expect(merged.createdBy?.id).toBe("legacy-creator");
    expect(merged.createdAt).toBe("2025-12-01T00:00:00.000Z");
    expect(merged.updatedBy?.id).toBe("editor");
    expect(merged.updatedAt).toBe("2025-12-02T00:00:00.000Z");
    expect(merged.assignedTo).toBe("user-9");
  });
});

describe("hydratePageDslAuthorship", () => {
  it("projects canonical authorship onto legacy DSL fields", () => {
    const page: PageDSL = {
      id: "home",
      title: "Home",
      slug: "home",
      nodes: [],
    };

    const hydrated = hydratePageDslAuthorship(page, {
      updatedBy: { id: "editor", username: "Editor" },
      updatedAt: "2026-01-03T00:00:00.000Z",
      createdBy: { id: "creator", username: "Creator" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(hydrated.author).toEqual({
      id: "editor",
      name: "Editor",
    });
    expect(hydrated.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(hydrated.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("formatActorDisplayName", () => {
  it("prefers username over id", () => {
    expect(formatActorDisplayName({ id: "user-1", username: "andy" })).toBe(
      "andy",
    );
  });

  it("falls back to id when username is absent", () => {
    expect(formatActorDisplayName({ id: "user-1" })).toBe("user-1");
  });
});

describe("toPageInventoryAuthorship", () => {
  it("adds lastEditorName from updatedBy", () => {
    const summary = toPageInventoryAuthorship({
      updatedBy: { id: "editor", username: "Editor" },
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    expect(summary.lastEditorName).toBe("Editor");
    expect(summary.updatedAt).toBe("2026-01-03T00:00:00.000Z");
  });
});
