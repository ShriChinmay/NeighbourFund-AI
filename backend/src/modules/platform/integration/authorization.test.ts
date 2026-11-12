
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Request } from "express";

import { optionalAuth } from "../auth/session.js";
import { findSessionUser } from "../auth/repository.js";

const query = vi.fn();

vi.mock("../../../config/database.js", () => ({
  getPool: () => ({ query }),
}));

vi.mock("../auth/repository.js", () => ({
  findSessionUser: vi.fn(),
}));

import {
  completionAuthorization,
  createEvidenceAuthorization,
  resolveIdentity,
  resolveOrganiserIdentity,
  resolveReviewerIdentity,
} from "./authorization.js";

const organiser = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const milestone = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444";

const req = (role?: string, id = organiser) =>
  ({ auth: role ? { id, role } : undefined }) as Request;

beforeEach(() => {
  query.mockReset();
  vi.mocked(findSessionUser).mockReset();
});

// Test app uses the actual P3 session middleware and Gate A identity resolver.
function createGateAApp(
  auth: ReturnType<typeof createEvidenceAuthorization>
) {
  const app = express();

  app.use(express.json());
  app.use(optionalAuth);

  app.post("/gate-a", async (req, res) => {
    const reviewerId = resolveReviewerIdentity(req);

    if (!reviewerId) {
      return res.sendStatus(401);
    }

    const { projectId, expenseId, evidenceId } = req.body;

    const allowed = await auth.canAssessGateA(
      req,
      projectId,
      expenseId,
      evidenceId
    );

    return res.sendStatus(allowed ? 200 : 403);
  });

  return app;
}

const validGateARequest = {
  projectId: project,
  expenseId: milestone,
  evidenceId: milestone,
};

describe("P4 authorization adapter", () => {
  it("never trusts unauthenticated requests", () => {
    expect(resolveIdentity(req())).toBeNull();
    expect(resolveOrganiserIdentity(req("reviewer"))).toBeNull();
    expect(resolveReviewerIdentity(req("organiser"))).toBeNull();
  });

  it("resolves only session roles", () => {
    expect(resolveOrganiserIdentity(req("organiser"))).toBe(organiser);
    expect(resolveReviewerIdentity(req("reviewer"))).toBe(organiser);
  });

  it("rejects unknown users and invalid milestone ids", async () => {
    expect(
      await completionAuthorization.canManageMilestone("invalid", milestone)
    ).toBe(false);

    query.mockResolvedValueOnce({ rows: [] });

    expect(
      await completionAuthorization.canManageMilestone(organiser, milestone)
    ).toBe(false);
  });

  it("allows organiser to manage owned milestone", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: organiser, role: "organiser" }],
    });
    query.mockResolvedValueOnce({
      rows: [{ organiser_id: organiser }],
    });

    expect(
      await completionAuthorization.canManageMilestone(organiser, milestone)
    ).toBe(true);
  });

  it("rejects cross-project organiser", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: organiser, role: "organiser" }],
    });
    query.mockResolvedValueOnce({
      rows: [{ organiser_id: other }],
    });

    expect(
      await completionAuthorization.canManageMilestone(organiser, milestone)
    ).toBe(false);
  });

  it("reviewer can review existing milestone", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: organiser, role: "reviewer" }],
    });
    query.mockResolvedValueOnce({
      rows: [{ id: milestone }],
      rowCount: 1,
    });

    expect(
      await completionAuthorization.canReviewProof(organiser, milestone)
    ).toBe(true);
  });

  it("denies evidence resource access when ownership lookups are unavailable", async () => {
    const auth = createEvidenceAuthorization();

    expect(await auth.canReadEvidence(req("reviewer"), milestone)).toBe(false);
    expect(await auth.canResolveReview(req("reviewer"), milestone)).toBe(false);
    expect(
      await auth.canAssessGateA(req("admin"), project, milestone, milestone)
    ).toBe(false);

    expect(query).not.toHaveBeenCalled();
  });

  it("denies cross-project expense upload", async () => {
    const auth = createEvidenceAuthorization({
      expenseProjectId: async () => other,
    });

    query.mockResolvedValueOnce({
      rows: [{ organiser_id: organiser }],
    });

    expect(
      await auth.canUpload(req("organiser"), project, milestone)
    ).toBe(false);
  });

  it("propagates database failures without granting access", async () => {
    query.mockRejectedValueOnce(new Error("db offline"));

    await expect(
      completionAuthorization.canReviewProof(organiser, milestone)
    ).rejects.toThrow("db offline");
  });

  // Integrated tests using the actual P3 session middleware.

  it("authorizes Gate A using an authenticated P3 reviewer session", async () => {
    vi.mocked(findSessionUser).mockResolvedValue({
      id: other,
      displayName: "Reviewer",
      email: "reviewer@example.com",
      role: "reviewer",
    });

    const auth = createEvidenceAuthorization({
      expenseProjectId: async () => project,
      evidenceProjectId: async () => project,
    });

    query.mockResolvedValueOnce({
      rows: [{ organiser_id: organiser }],
    });

    const app = createGateAApp(auth);

    const response = await request(app)
      .post("/gate-a")
      .set("Cookie", `nf_session=${"a".repeat(64)}`)
      .send(validGateARequest);

    expect(response.status).toBe(200);
    expect(findSessionUser).toHaveBeenCalledOnce();
  });

  it("rejects Gate A when the P3 session has an insufficient role", async () => {
    vi.mocked(findSessionUser).mockResolvedValue({
      id: other,
      displayName: "Resident",
      email: "resident@example.com",
      role: "resident",
    });

    const auth = createEvidenceAuthorization();
    const app = createGateAApp(auth);

    const response = await request(app)
      .post("/gate-a")
      .set("Cookie", `nf_session=${"b".repeat(64)}`)
      .send(validGateARequest);

    expect(response.status).toBe(401);
    expect(findSessionUser).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated Gate A requests", async () => {
    const auth = createEvidenceAuthorization();
    const app = createGateAApp(auth);

    const response = await request(app)
      .post("/gate-a")
      .send(validGateARequest);

    expect(response.status).toBe(401);
    expect(findSessionUser).not.toHaveBeenCalled();
  });

  it("rejects Gate A access across projects using a P3 reviewer session", async () => {
    vi.mocked(findSessionUser).mockResolvedValue({
      id: other,
      displayName: "Reviewer",
      email: "reviewer@example.com",
      role: "reviewer",
    });

    const auth = createEvidenceAuthorization({
      expenseProjectId: async () => other,
      evidenceProjectId: async () => project,
    });

    query.mockResolvedValueOnce({
      rows: [{ organiser_id: organiser }],
    });

    const app = createGateAApp(auth);

    const response = await request(app)
      .post("/gate-a")
      .set("Cookie", `nf_session=${"c".repeat(64)}`)
      .send(validGateARequest);

    expect(response.status).toBe(403);
    expect(findSessionUser).toHaveBeenCalledOnce();
  });

  it("rejects invalid project, expense and evidence IDs using a P3 reviewer session", async () => {
    vi.mocked(findSessionUser).mockResolvedValue({
      id: other,
      displayName: "Reviewer",
      email: "reviewer@example.com",
      role: "reviewer",
    });

    const auth = createEvidenceAuthorization();
    const app = createGateAApp(auth);

    const invalidRequests = [
      {
        projectId: "invalid-project",
        expenseId: milestone,
        evidenceId: milestone,
      },
      {
        projectId: project,
        expenseId: "invalid-expense",
        evidenceId: milestone,
      },
      {
        projectId: project,
        expenseId: milestone,
        evidenceId: "invalid-evidence",
      },
    ];

    for (const body of invalidRequests) {
      const response = await request(app)
        .post("/gate-a")
        .set("Cookie", `nf_session=${"d".repeat(64)}`)
        .send(body);

      expect(response.status).toBe(403);
    }

    expect(findSessionUser).toHaveBeenCalledTimes(3);
    expect(query).not.toHaveBeenCalled();
  });
});
