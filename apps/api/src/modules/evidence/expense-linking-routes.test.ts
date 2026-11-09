import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import { createEvidenceRouter } from "./routes.js";

const uploadedFiles: string[] = [];

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
  app.use(createEvidenceRouter(service));

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
  it("creates JSON evidence linked to an existing expense", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/evidence")
      .send({
        projectId: "project-1",
        expenseId: "expense-1",
        uploadedBy: "organiser-1",
        originalFileName: "invoice.pdf",
        storageKey: "invoice-1.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.expenseId).toBe("expense-1");
  });

  it("rejects evidence linked to a nonexistent expense", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/evidence")
      .send({
        projectId: "project-1",
        expenseId: "missing-expense",
        uploadedBy: "organiser-1",
        originalFileName: "invoice.pdf",
        storageKey: "invoice-2.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Expense record not found.");
  });

  it("rejects evidence linked to an expense from another project", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/evidence")
      .send({
        projectId: "project-1",
        expenseId: "expense-other-project",
        uploadedBy: "organiser-1",
        originalFileName: "invoice.pdf",
        storageKey: "invoice-3.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Expense does not belong to the specified project."
    );
  });

  it("saves expenseId during multipart document upload", async () => {
    const { app } = await setup();

    const response = await request(app)
      .post("/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("expenseId", "expense-1")
      .field("uploadedBy", "organiser-1")
      .attach("file", Buffer.from("%PDF-1.4 test invoice"), {
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
