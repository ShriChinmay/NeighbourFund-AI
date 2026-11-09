import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import {
  MAX_EVIDENCE_FILE_SIZE,
} from "./schemas.js";
import { createEvidenceRouter } from "./routes.js";

describe("Evidence Upload Routes", () => {
  let app: express.Express;
  const uploadedFiles: string[] = [];

  beforeEach(() => {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    app = express();
    app.use(express.json());
    app.use("/api", createEvidenceRouter(service));
  });

  afterEach(async () => {
    for (const filename of uploadedFiles.splice(0)) {
      try {
        await unlink(
          resolve(process.cwd(), "storage", "evidence", filename)
        );
      } catch {
        // File may already have been deleted by the route.
      }
    }
  });

  it("uploads a valid PDF document", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("uploadedBy", "organiser-1")
      .attach(
        "file",
        Buffer.from("%PDF-1.4\nTest invoice"),
        {
          filename: "invoice.pdf",
          contentType: "application/pdf",
        }
      );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("uploaded");
    expect(response.body.data.projectId).toBe("project-1");
    expect(response.body.data.milestoneId).toBe("milestone-1");
    expect(response.body.data.originalFileName).toBe("invoice.pdf");

    uploadedFiles.push(response.body.data.storageKey);
  });

  it("rejects a request without a file", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("uploadedBy", "organiser-1");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("file");
  });

  it("rejects an unsupported file type", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("uploadedBy", "organiser-1")
      .attach(
        "file",
        Buffer.from("plain text"),
        {
          filename: "invoice.txt",
          contentType: "text/plain",
        }
      );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Unsupported");
  });

  it("rejects files larger than 10 MB", async () => {
    const oversizedFile = Buffer.alloc(MAX_EVIDENCE_FILE_SIZE + 1);

    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("projectId", "project-1")
      .field("uploadedBy", "organiser-1")
      .attach("file", oversizedFile, {
        filename: "large-invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("10 MB");
  });

  it("rejects missing project information", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .field("uploadedBy", "organiser-1")
      .attach(
        "file",
        Buffer.from("%PDF-1.4\nTest invoice"),
        {
          filename: "invoice.pdf",
          contentType: "application/pdf",
        }
      );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toBeDefined();
  });
});
