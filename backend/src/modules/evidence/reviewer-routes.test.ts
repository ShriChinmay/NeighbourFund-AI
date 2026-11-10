import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import {
  createEvidenceRouter,
  type EvidenceAuthorization,
} from "./routes.js";

describe("Evidence Reviewer Routes", () => {
  function createApp(authenticated = false) {
    const repository = new InMemoryEvidenceRepository();
    const service = new EvidenceService(repository);

    const app = express();
    app.use(express.json());

    const testAuthorization: EvidenceAuthorization = {
      canUpload: async () => false,
      canReview: async () => false,
      canAccessReviewQueue: async () => true,
      canResolveReview: async () => true,
      canAssessGateA: async () => false,
    };

    app.use(
      "/api",
      createEvidenceRouter(
        service,
        () => (authenticated ? "trusted-reviewer-1" : null),
        undefined,
        undefined,
        testAuthorization
      )
    );

    return app;
  }

  it("rejects review queue access without reviewer identity", async () => {
    const response = await request(createApp())
      .get("/api/projects/project-1/review-queue");

    expect(response.status).toBe(401);
  });

  it("allows an authenticated and authorized reviewer to retrieve an empty queue", async () => {
    const response = await request(createApp(true))
      .get("/api/projects/project-1/review-queue");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it("rejects review resolution without reviewer identity", async () => {
    const response = await request(createApp())
      .post("/api/reviews/review-1/resolve")
      .send({ resolution: "approved" });

    expect(response.status).toBe(401);
  });

  it("rejects forged reviewer identity in request body", async () => {
    const response = await request(createApp(true))
      .post("/api/reviews/review-1/resolve")
      .send({
        reviewerId: "forged-reviewer",
        resolution: "approved",
      });

    expect(response.status).toBe(400);
  });

  it("rejects invalid resolution values", async () => {
    const response = await request(createApp(true))
      .post("/api/reviews/review-1/resolve")
      .send({ resolution: "fraud" });

    expect(response.status).toBe(400);
  });
});
