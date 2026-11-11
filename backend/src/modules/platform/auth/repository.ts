import type { PoolClient } from "pg";
import { getPool } from "../../../config/database.js";
import type { AuthUser, Role } from "./types.js";

type UserRow = { id: string; display_name: string; email: string; role: Role };
const toUser = (row: UserRow): AuthUser => ({
  id: row.id, displayName: row.display_name, email: row.email, role: row.role,
});

export async function getDemoUserByRole(role: Role): Promise<AuthUser | null> {
  const result = await getPool().query<UserRow>(
    `SELECT id, display_name, email, role FROM users
     WHERE role = $1 AND email = $2 LIMIT 1`, [role, `${role}@demo.neighbourfund.invalid`]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO auth_sessions(user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function findSessionUser(tokenHash: string): Promise<AuthUser | null> {
  const result = await getPool().query<UserRow>(
    `SELECT u.id, u.display_name, u.email, u.role FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
     LIMIT 1`, [tokenHash],
  );
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await getPool().query(
    `UPDATE auth_sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash],
  );
}

export async function recordAudit(
  event: { actorId: string | null; entity: string; entityId: string; action: string; metadata?: Record<string, unknown> },
  client?: Pick<PoolClient, "query">,
): Promise<void> {
  const executor = client ?? getPool();
  await executor.query(
    `INSERT INTO audit_events(actor_id, entity, entity_id, action, metadata_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [event.actorId, event.entity, event.entityId, event.action, JSON.stringify(event.metadata ?? {})],
  );
}
