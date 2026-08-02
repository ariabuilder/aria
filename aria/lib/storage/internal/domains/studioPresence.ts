import {
  StoredStudioPresenceSessionSchema,
  type StorageAdapter,
  type StoredStudioPresenceSession,
} from "../../adapter";
import {
  StudioPresenceAttachmentSchema,
  resolveEffectivePresence,
  type StudioPresenceAttachment,
} from "../../../realtime/studioLive";

export type StudioPresenceStorageDomain = Pick<
  StorageAdapter,
  | "upsertStudioPresenceSession"
  | "listStudioPresenceSessions"
  | "deleteStudioPresenceSession"
>;

type StudioPresenceStorageContext = {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
};

type StudioPresenceRow = {
  session_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  surface: string;
  resource_type: string | null;
  resource_id: string | null;
  state: string;
  dirty: number;
  connected_at: number;
  last_activity_at: number;
  lease_expires_at: number | null;
};

function parseSession(row: StudioPresenceRow): StudioPresenceAttachment {
  return StudioPresenceAttachmentSchema.parse({
    sessionId: row.session_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    surface: row.surface,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    state: row.state,
    dirty: row.dirty === 1,
    connectedAt: row.connected_at,
    lastActivityAt: row.last_activity_at,
    leaseExpiresAt: row.lease_expires_at,
  });
}

const SESSION_COLUMNS = `session_id, user_id, display_name, avatar_url,
  surface, resource_type, resource_id, state, dirty, connected_at,
  last_activity_at, lease_expires_at`;

export function createStudioPresenceStorageDomain(
  context: StudioPresenceStorageContext,
): StudioPresenceStorageDomain {
  return {
    async upsertStudioPresenceSession(
      input: StoredStudioPresenceSession,
    ): Promise<StudioPresenceAttachment | null> {
      const session = StoredStudioPresenceSessionSchema.parse(input);
      await context.run(
        `DELETE FROM aria_studio_presence_sessions WHERE expires_at <= ?`,
        [session.lastActivityAt],
      );
      const row = await context.queryFirst<StudioPresenceRow>(
        `INSERT INTO aria_studio_presence_sessions (
           session_id, user_id, display_name, avatar_url, surface,
           resource_type, resource_id, state, dirty, connected_at,
           last_activity_at, lease_expires_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           surface = excluded.surface,
           resource_type = excluded.resource_type,
           resource_id = excluded.resource_id,
           state = excluded.state,
           dirty = excluded.dirty,
           last_activity_at = excluded.last_activity_at,
           lease_expires_at = excluded.lease_expires_at,
           expires_at = excluded.expires_at
         WHERE aria_studio_presence_sessions.user_id = excluded.user_id
           AND aria_studio_presence_sessions.last_activity_at < excluded.last_activity_at
         RETURNING ${SESSION_COLUMNS}`,
        [
          session.sessionId,
          session.userId,
          session.displayName,
          session.avatarUrl,
          session.surface,
          session.resourceType,
          session.resourceId,
          session.state,
          session.dirty ? 1 : 0,
          session.connectedAt,
          session.lastActivityAt,
          session.leaseExpiresAt,
          session.expiresAt,
        ],
      );

      if (!row) return null;
      return resolveEffectivePresence(
        parseSession(row),
        session.lastActivityAt,
      );
    },

    async listStudioPresenceSessions(
      now: number,
    ): Promise<StudioPresenceAttachment[]> {
      const rows = await context.queryAll<StudioPresenceRow>(
        `SELECT ${SESSION_COLUMNS}
         FROM aria_studio_presence_sessions
         WHERE expires_at > ?
         ORDER BY connected_at ASC, session_id ASC`,
        [now],
      );
      return rows.map((row) =>
        resolveEffectivePresence(parseSession(row), now),
      );
    },

    deleteStudioPresenceSession(
      sessionId: string,
      userId: string,
    ): Promise<void> {
      return context.run(
        `DELETE FROM aria_studio_presence_sessions
         WHERE session_id = ? AND user_id = ?`,
        [sessionId, userId],
      );
    },
  };
}
