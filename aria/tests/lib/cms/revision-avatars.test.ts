import { describe, expect, it } from "vitest";
import {
  buildUserAvatarLookup,
  resolveActorAvatarUrl,
} from "../../../lib/authorship/avatarLookup";
import { enrichCmsRevisionsWithAvatars } from "../../../lib/cms/services/revisionAvatars";
import { mapEntryRevisionRow } from "../../../lib/cms/storage/db";

describe("avatar lookup", () => {
  it("prefers snapshot avatar over live lookup", () => {
    const lookup = buildUserAvatarLookup([
      { id: "user-1", avatarUrl: "/uploads/live.avif" },
    ]);

    expect(
      resolveActorAvatarUrl("user-1", "/uploads/snapshot.avif", lookup),
    ).toBe("/uploads/snapshot.avif");
  });

  it("falls back to live user avatar when snapshot is missing", () => {
    const lookup = buildUserAvatarLookup([
      { id: "user-1", avatarUrl: "/uploads/live.avif" },
    ]);

    expect(resolveActorAvatarUrl("user-1", null, lookup)).toBe(
      "/uploads/live.avif",
    );
  });
});

describe("enrichCmsRevisionsWithAvatars", () => {
  it("adds avatarUrl to revision authorship from user lookup", () => {
    const [enriched] = enrichCmsRevisionsWithAvatars(
      [
        {
          id: "rev-1",
          entryId: "entry-1",
          locale: "en",
          version: "v1",
          snapshot: {
            entry: {
              id: "entry-1",
              collectionId: "posts",
              status: "draft",
              version: "v1",
              authorId: "user-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              publishedAt: null,
              scheduledFor: null,
            },
            locales: [],
          },
          actorId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          authorship: {
            actor: {
              id: "user-1",
              username: "admin",
            },
          },
        },
      ],
      [{ id: "user-1", avatarUrl: "/uploads/admin.avif" }],
    );

    expect(enriched.authorship?.actor?.avatarUrl).toBe("/uploads/admin.avif");
  });
});

describe("mapEntryRevisionRow", () => {
  it("maps actor_avatar_url into authorship.actor.avatarUrl", () => {
    const revision = mapEntryRevisionRow({
      id: "rev-1",
      entry_id: "entry-1",
      locale: "en",
      version: "v1",
      snapshot_json: JSON.stringify({
        entry: {
          id: "entry-1",
          collectionId: "posts",
          status: "draft",
          version: "v1",
          authorId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: null,
          scheduledFor: null,
        },
        locales: [
          {
            entryId: "entry-1",
            collectionId: "posts",
            locale: "en",
            slug: "hello",
            title: "Hello",
            frontmatter: {},
            body: null,
            isSource: true,
          },
        ],
      }),
      actor_id: "user-1",
      actor_username: "admin",
      actor_email: "admin@example.test",
      actor_avatar_url: "/uploads/admin.avif",
      message: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    expect(revision.authorship?.actor?.avatarUrl).toBe("/uploads/admin.avif");
  });
});
