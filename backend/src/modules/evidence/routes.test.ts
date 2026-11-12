
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import { MAX_EVIDENCE_FILE_SIZE } from "./schemas.js";
import {
  createEvidenceRouter,
  type EvidenceAuthorization,
} from "./routes.js";

describe("Evidence Upload Routes", () => {
  let app: express.Express;
  const uploadedFiles: string[] = [];

  const testAuthorization: EvidenceAuthorization = {
    getProjectOrganiserId: async () => null,
    canUpload: async () => true,
    canReadEvidence: async () => true,
    canReadProject: async () => true,
    canExtract: async () => true,
    canReview: async () => true,
    canAccessReviewQueue: async () => true,
    canResolveReview: async () => true,
    canAssessGateA: async () => true,
  };

  beforeEach(() => {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    app = express();
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

  it("uploads a valid PDF document using the authenticated uploader identity", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .set("x-project-id", "project-1")
      .field("projectId", "project-1")
      .field("uploadedBy", "forged-client-uploader")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("uploaded");
    expect(response.body.data.projectId).toBe("project-1");
    expect(response.body.data.milestoneId).toBe("milestone-1");
    expect(response.body.data.originalFileName).toBe("invoice.pdf");
    expect(response.body.data.uploadedBy).toBe("trusted-uploader-1");

    uploadedFiles.push(response.body.data.storageKey);
  });

  it("rejects a request without a file", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .set("x-project-id", "project-1")
      .field("projectId", "project-1");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("file");
  });

  it("rejects an unsupported file type", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .set("x-project-id", "project-1")
      .field("projectId", "project-1")
      .attach("file", Buffer.from("plain text"), {
        filename: "invoice.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Unsupported");
  });

  it("rejects files larger than 10 MB", async () => {
    const oversizedFile = Buffer.alloc(MAX_EVIDENCE_FILE_SIZE + 1);

    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .set("x-project-id", "project-1")
      .field("projectId", "project-1")
      .attach("file", oversizedFile, {
        filename: "large-invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("10 MB");
  });

  it("rejects missing project information before authorization", async () => {
    const response = await request(app)
      .post("/api/milestones/milestone-1/documents")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Project identifier");
  });

  it("rejects a valid upload when the authorization interface denies access", async () => {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    const denyAuthorization: EvidenceAuthorization = {
      getProjectOrganiserId: async () => null,
      canUpload: async () => false,
      canReview: async () => false,
      canAccessReviewQueue: async () => false,
      canResolveReview: async () => false,
      canAssessGateA: async () => false,
      canReadEvidence: async () => false,
      canReadProject: async () => false,
      canExtract: async () => false,
    };

    const deniedApp = express();
    deniedApp.use(express.json());
    deniedApp.use(
      "/api",
      createEvidenceRouter(
        service,
        undefined,
        undefined,
        () => "trusted-uploader-1",
        denyAuthorization
      )
    );

    const response = await request(deniedApp)
      .post("/api/milestones/milestone-1/documents")
      .set("x-project-id", "project-1")
      .field("projectId", "project-1")
      .attach("file", Buffer.from("%PDF-1.4\nTest invoice"), {
        filename: "invoice.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("blocks unauthorized evidence reads, project access, and invoice extraction", async () => {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    const readDeniedAuthorization: EvidenceAuthorization = {
      ...testAuthorization,
      canReadEvidence: async () => false,
      canReadProject: async () => false,
      canExtract: async () => false,
    };

    const deniedApp = express();
    deniedApp.use(express.json());
    deniedApp.use(
      "/api",
      createEvidenceRouter(
        service,
        undefined,
        undefined,
        () => "trusted-uploader-1",
        readDeniedAuthorization
      )
    );

    const evidenceResponse = await request(deniedApp)
      .get("/api/evidence/evidence-1");

    const documentResponse = await request(deniedApp)
      .get("/api/documents/evidence-1");

    const projectEvidenceResponse = await request(deniedApp)
      .get("/api/projects/project-1/evidence");

    const expensesResponse = await request(deniedApp)
      .get("/api/projects/project-1/expenses");

    const coverageResponse = await request(deniedApp)
      .get("/api/projects/project-1/evidence-coverage");

    const extractionResponse = await request(deniedApp)
      .post("/api/evidence/evidence-1/extract");

    expect(evidenceResponse.status).toBe(403);
    expect(documentResponse.status).toBe(403);
    expect(projectEvidenceResponse.status).toBe(403);
    expect(expensesResponse.status).toBe(403);
    expect(coverageResponse.status).toBe(403);
    expect(extractionResponse.status).toBe(403);
  });

  it("denies protected read and extraction routes by default", async () => {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    const defaultDeniedApp = express();
    defaultDeniedApp.use(express.json());

    // No authorization provider is supplied.
    defaultDeniedApp.use(
      "/api",
      createEvidenceRouter(service)
    );

    const evidenceResponse = await request(defaultDeniedApp)
      .get("/api/evidence/evidence-1");

    const projectResponse = await request(defaultDeniedApp)
      .get("/api/projects/project-1/evidence");

    const extractionResponse = await request(defaultDeniedApp)
      .post("/api/evidence/evidence-1/extract");

    expect(evidenceResponse.status).toBe(403);
    expect(projectResponse.status).toBe(403);
    expect(extractionResponse.status).toBe(403);
  });
});
