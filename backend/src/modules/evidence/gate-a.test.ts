import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import {
  createEvidenceRouter,
  type EvidenceAuthorization,
} from "./routes.js";

function setup(
  reviewerId: string | null = "reviewer-1",
  organiserId: string | null = "organiser-1"
) {
  const repo = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repo);

  const app = express();
  app.use(express.json());

  const testAuthorization: EvidenceAuthorization = {
    getProjectOrganiserId: async () => "organiser-1",
    canUpload: async () => false,
    canReview: async () => true,
    canAccessReviewQueue: async () => true,
    canResolveReview: async () => true,
    canAssessGateA: async () => true,
    canReadEvidence: async () => false,
    canReadProject: async () => true,
    canExtract: async () => false,
  };

  app.use(
    createEvidenceRouter(
      service,
      () => reviewerId,
      () => organiserId,
      undefined,
      testAuthorization
    )
  );

  return { app, repo, service };
}

async function seedExpenseAndEvidence(
  repo: InMemoryEvidenceRepository
) {
  const now = new Date();

  await repo.createExpense({
    id: "expense-1",
    projectId: "project-1",
    budgetId: "budget-1",
    vendor: "Solar Vendor",
    amountMinor: 50000,
    currency: "INR",
    date: "2026-11-09",
    reviewStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await repo.createEvidence({
    id: "evidence-1",
    projectId: "project-1",
    milestoneId: "milestone-1",
    expenseId: "expense-1",
    uploadedBy: "organiser-1",
    originalFileName: "invoice.pdf",
    storageKey: "invoice.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    status: "confirmed",
    confirmedMetadata: {
      vendorName: "Solar Vendor",
      totalAmountCents: 50000,
      currency: "INR",
    },
    uploadedAt: now,
    updatedAt: now,
  });
}

describe("P4 evidence coverage and Gate A readiness", () => {
  it("returns project evidence coverage", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .get("/projects/project-1/evidence-coverage");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalExpenses).toBe(1);
    expect(response.body.data.totalEvidenceDocuments).toBe(1);
    expect(response.body.data.confirmedDocuments).toBe(1);
    expect(response.body.data.coveragePercentage).toBe(100);
  });

  it("blocks Gate A when reviewer approval is missing", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.eligible).toBe(false);
    expect(response.body.data.reasons).toContain(
      "Evidence does not have approval from the specified reviewer."
    );
  });

  it("allows Gate A evidence readiness after reviewer approval", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const now = new Date();

    await repo.createVerificationReview({
      id: "review-1",
      expenseId: "expense-1",
      evidenceId: "evidence-1",
      flagType: "amount_differs",
      explanation: "Amount verified manually.",
      reviewerId: "reviewer-1",
      resolution: "approved",
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.eligible).toBe(true);
    expect(response.body.data.reasons).toEqual([]);
  });

  it("blocks organiser self-approval", async () => {
    const { app, repo } = setup("organiser-1", "organiser-1");
    await seedExpenseAndEvidence(repo);

    const now = new Date();

    await repo.createVerificationReview({
      id: "review-1",
      expenseId: "expense-1",
      evidenceId: "evidence-1",
      flagType: "amount_differs",
      explanation: "Self-approved review.",
      reviewerId: "organiser-1",
      resolution: "approved",
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.eligible).toBe(false);
    expect(response.body.data.reasons).toContain(
      "Organiser cannot approve their own expense."
    );
  });

  it("rejects evidence from another milestone", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/different-milestone/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("requires authenticated reviewer identity", async () => {
    const { app, repo } = setup(null);
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(401);
  });

  it("does not accept reviewerId from the request body", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
        reviewerId: "attacker-controlled",
      });

    expect(response.status).toBe(400);
  });

  it("blocks Gate A when evidence is linked to a different expense", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const now = new Date();

    await repo.createExpense({
      id: "expense-2",
      projectId: "project-1",
      budgetId: "budget-1",
      vendor: "Another Vendor",
      amountMinor: 30000,
      currency: "INR",
      date: "2026-11-09",
      reviewStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });

    await repo.createVerificationReview({
      id: "review-2",
      expenseId: "expense-2",
      flagType: "amount_differs",
      explanation: "Amount verified.",
      reviewerId: "reviewer-1",
      resolution: "approved",
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-2",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.eligible).toBe(false);
    expect(response.body.data.reasons).toContain(
      "Evidence is not linked to the specified expense."
    );
  });

  it("rejects a client-supplied organiser identity", async () => {
    const { app, repo } = setup();
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
        organiserId: "attacker-controlled",
      });

    expect(response.status).toBe(400);
  });

  it("does not require an authenticated organiser session", async () => {
    const { app, repo } = setup("reviewer-1", null);
    await seedExpenseAndEvidence(repo);

    const response = await request(app)
      .post("/milestones/milestone-1/gate-a/decision")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        evidenceId: "evidence-1",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.eligible).toBe(false);
    expect(response.body.data.reasons).toContain(
      "Evidence does not have approval from the specified reviewer."
    );
  });
});
