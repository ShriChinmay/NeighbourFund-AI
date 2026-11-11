import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { hashSessionToken, makeSessionToken, requireRoles } from "./session.js";
import express from "express";

describe("platform auth", () => {
  it("returns 401 for unauthenticated /api/me without database lookup", async () => {
    const response = await request(createApp()).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
  it("validates demo role input before database access", async () => {
    const response = await request(createApp()).post("/api/auth/switch-role")
      .send({ role: "superadmin" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
  it("hashes a new random session token", () => {
    const first = makeSessionToken(), second = makeSessionToken();
    expect(first).toHaveLength(64);
    expect(first).not.toBe(second);
    expect(hashSessionToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(first)).not.toBe(first);
  });
  it("enforces role checks", async () => {
    const testApp = express();
    testApp.get("/organiser", (req, _res, next) => {
      req.auth = { id: "1", displayName: "Test", email: "test@example.com", role: "resident" };
      next();
    }, requireRoles("organiser"), (_req, res) => res.json({ ok: true }));
    const response = await request(testApp).get("/organiser");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
