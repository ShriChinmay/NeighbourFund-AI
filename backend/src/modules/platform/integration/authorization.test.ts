import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
const query = vi.fn();
vi.mock("../../../config/database.js", () => ({ getPool: () => ({ query }) }));
import { completionAuthorization, createEvidenceAuthorization, resolveIdentity, resolveOrganiserIdentity, resolveReviewerIdentity } from "./authorization.js";
const organiser = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const milestone = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444";
const req = (role?: string, id = organiser) => ({ auth: role ? { id, role } : undefined }) as Request;
beforeEach(() => query.mockReset());
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
    expect(await completionAuthorization.canManageMilestone("invalid", milestone)).toBe(false);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await completionAuthorization.canManageMilestone(organiser, milestone)).toBe(false);
  });
  it("allows organiser to manage owned milestone", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: organiser, role: "organiser" }] });
    query.mockResolvedValueOnce({ rows: [{ organiser_id: organiser }] });
    expect(await completionAuthorization.canManageMilestone(organiser, milestone)).toBe(true);
  });
  it("rejects cross-project organiser", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: organiser, role: "organiser" }] });
    query.mockResolvedValueOnce({ rows: [{ organiser_id: other }] });
    expect(await completionAuthorization.canManageMilestone(organiser, milestone)).toBe(false);
  });
  it("reviewer can review existing milestone", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: organiser, role: "reviewer" }] });
    query.mockResolvedValueOnce({ rows: [{ id: milestone }], rowCount: 1 });
    expect(await completionAuthorization.canReviewProof(organiser, milestone)).toBe(true);
  });
  it("denies evidence resource access until P4 provides ownership lookup", async () => {
    const auth = createEvidenceAuthorization();
    expect(await auth.canReadEvidence(req("reviewer"), milestone)).toBe(false);
    expect(await auth.canResolveReview(req("reviewer"), milestone)).toBe(false);
    expect(await auth.canAssessGateA(req("admin"), project, milestone, milestone)).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it("denies cross-project expense upload", async () => {
    const auth = createEvidenceAuthorization({ expenseProjectId: async () => other });
    query.mockResolvedValueOnce({ rows: [{ organiser_id: organiser }] });
    expect(await auth.canUpload(req("organiser"), project, milestone)).toBe(false);
  });
  it("propagates database failures without granting access", async () => {
    query.mockRejectedValueOnce(new Error("db offline"));
    await expect(completionAuthorization.canReviewProof(organiser, milestone)).rejects.toThrow("db offline");
  });
});
