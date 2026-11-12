
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import {
  createEvidenceRouter,
  type EvidenceAuthorization,
} from "./routes.js";

const uploadedFiles: string[] = [];

const testAuthorization: EvidenceAuthorization = {
  getProjectOrganiserId: async () => null,
  canUpload: async () => true,
  canReview: async () => true,
  canAccessReviewQueue: async () => true,
  canResolveReview: async () => true,
  canAssessGateA: async () => true,
  canReadEvidence: async () => true,
  canReadProject: async () => true,
  canExtract: async () => true,
};

afterEach(async () => {
  await Promise.all(
    uploadedFiles.splice(0).map(async (storageKey) => {
      try {
        await unlink(
          resolve(process.cwd(), "storage", "evidence", storageKey)
        );
      } catch {
        // Ignore files already removed.
      }
    })
  );
});

async function setup() {
  const repo = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repo);

  const app = express();
  app.use(express.json());

  app.use(
    "/api",
    createEvidenceRouter(
      service,
      undefined,
      undefined,
      () => "trusted-uploader-1",
      testAuthorization
    )
  );

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

  await repo.createExpense({
    id: "expense-other-project",
    projectId: "project-2",
    budgetId: "budget-2",
    vendor: "Another Vendor",
    amountMinor: 30000,
    currency: "INR",
    date: "2026-11-09",
    reviewStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });

  return { app, repo };
}

describe("Evidence expense linking routes", () => {
  it("uploads evidence linked to an existing expense", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/api/evidence")
      .field("projectId", "project-1")
      .field("expenseId", "expense-1")
      .field("uploadedBy", "forged-client-uploader")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    if (response.body.data?.storageKey) {
      uploadedFiles.push(response.body.data.storageKey);
    }

    expect(response.status).toBe(201);
    expect(response.body.data.expenseId).toBe("expense-1");
    expect(response.body.data.uploadedBy).toBe("trusted-uploader-1");
  });

  it("rejects evidence linked to a nonexistent expense", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/api/evidence")
      .field("projectId", "project-1")
      .field("expenseId", "missing-expense")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Expense record not found.");
  });

  it("rejects evidence linked to an expense from another project", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/api/evidence")
      .field("projectId", "project-1")
      .field("expenseId", "expense-other-project")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Expense does not belong to the specified project."
    );
  });

  it("saves expenseId during multipart milestone document upload", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("expenseId", "expense-1")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    if (response.body.data?.storageKey) {
      uploadedFiles.push(response.body.data.storageKey);
    }

    expect(response.status).toBe(201);
    expect(response.body.data.expenseId).toBe("expense-1");
    expect(response.body.data.status).toBe("uploaded");
  });
});
