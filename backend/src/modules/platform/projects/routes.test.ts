import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";

describe("Project API authorization", () => {
  it("rejects unauthenticated project creation", async () => {
    const r=await request(createApp()).post("/api/projects").send({});
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
  });
  it("rejects unauthenticated budget edits", async () => {
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/budget").send({});
    expect(r.status).toBe(401);
  });
  it("rejects unauthenticated milestone edits", async () => {
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/milestones").send({});
    expect(r.status).toBe(401);
  });
});
