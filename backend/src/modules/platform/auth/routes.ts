import { Router } from "express";
import { z } from "zod";
import { getPool } from "../../../config/database.js";
import { createSession, getDemoUserByRole, recordAudit, revokeSession } from "./repository.js";
import { COOKIE_NAME, SESSION_TTL_MS, clearSessionCookie, hashSessionToken,
  makeSessionToken, readSessionToken, requireAuth, requireRoles, setSessionCookie } from "./session.js";
import { ROLES } from "./types.js";

export const authRouter = Router();
const roleSchema = z.object({ role: z.enum(ROLES) }).strict();

// Demo-only identity switcher. Production requires explicit enablement and an access key.
authRouter.post("/auth/switch-role", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      if (process.env.ENABLE_DEMO_AUTH !== "true" || !process.env.DEMO_SWITCH_KEY) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
        return;
      }
      const supplied = req.get("x-demo-access-key");
      if (!supplied || supplied !== process.env.DEMO_SWITCH_KEY) {
        res.status(403).json({ error: { code: "DEMO_ACCESS_DENIED", message: "Demo access key required" } });
        return;
      }
    }
    // Browser origin is checked against explicit frontend origins.
    const origin = req.get("origin");
    if (origin) {
      const expected = new URL(`${req.protocol}://${req.get("host")}`).origin;
      const allowed = (process.env.APP_BASE_URL ?? "http://localhost:5173,http://127.0.0.1:5173")
        .split(",").map((value) => value.trim());
      if (origin !== expected && !allowed.includes(origin)) {
        res.status(403).json({ error: { code: "ORIGIN_FORBIDDEN", message: "Origin not allowed" } });
        return;
      }
    }
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid role", details: parsed.error.flatten() } });
      return;
    }
    const user = await getDemoUserByRole(parsed.data.role);
    if (!user) {
      res.status(503).json({ error: { code: "DEMO_USERS_MISSING", message: "Apply migration 002_demo_auth.sql" } });
      return;
    }
    const previous = readSessionToken(req);
    const token = makeSessionToken();
    const hash = hashSessionToken(token);
    const expiry = new Date(Date.now() + SESSION_TTL_MS);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      if (previous) {
        await client.query(`UPDATE auth_sessions SET revoked_at = now()
          WHERE token_hash = $1 AND revoked_at IS NULL`, [hashSessionToken(previous)]);
      }
      await client.query(`INSERT INTO auth_sessions(user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)`, [user.id, hash, expiry]);
      await recordAudit({ actorId: user.id, entity: "users", entityId: user.id,
        action: "demo_role_switch", metadata: { role: user.role } }, client);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    setSessionCookie(res, token);
    res.status(200).json({ user, demo: true });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.auth });
});

authRouter.post("/auth/logout", async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    if (token) await revokeSession(hashSessionToken(token));
    clearSessionCookie(res);
    res.status(200).json({ success: true });
  } catch (error) { next(error); }
});

authRouter.get("/audit", requireRoles("reviewer", "admin"), async (req, res, next) => {
  try {
    const entity = typeof req.query.entity === "string" ? req.query.entity : null;
    const id = typeof req.query.id === "string" ? req.query.id : null;
    if (!entity || !id || !z.string().uuid().safeParse(id).success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Specify entity and UUID id" } });
      return;
    }
    const result = await getPool().query(
      `SELECT a.id, a.actor_id AS "actorId", a.entity, a.entity_id AS "entityId", a.action,
       a.metadata_json AS metadata, a.created_at AS "createdAt"
       FROM audit_events a WHERE a.entity = $1 AND a.entity_id = $2
       ORDER BY a.created_at DESC, a.id DESC LIMIT 200`, [entity, id]);
    res.json({ events: result.rows });
  } catch (error) { next(error); }
});
