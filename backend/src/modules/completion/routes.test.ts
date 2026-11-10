import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { CompletionService } from "./service.js";
import {
  createCompletionRouter,
  type CompletionAuthorization,
} from "./routes.js";

import { InMemoryCompletionRepository } from "./in-memory-repo.js";

import type { GateBPrerequisiteProvider } from "./service.js";

describe("Completion HTTP Routes", () => {
  const secret = "test-secret-that-is-at-least-32-bytes-long";

  let service: CompletionService;
  let app: express.Express;
  let milestoneId: string;
  let proofId: string;

  const trustedReviewerResolver = () => "trusted-reviewer-123";

  /**
   * Test-only authorization configuration.
   *
   * Production must use trusted P3 authentication.
   * These identities must never be used in app.ts.
   */
  const testAuthorization: CompletionAuthorization = {
    resolveOrganiserIdentity: () => "trusted-organiser-123",
    resolveSubmitterIdentity: () => "trusted-submitter-123",
    resolveReviewerIdentity: trustedReviewerResolver,
    resolveViewerIdentity: () => "trusted-viewer-123",

    canManageMilestone: async () => true,
    canSubmitProof: async () => true,
    canReviewProof: async () => true,
    canViewMilestone: async () => true,
  };

  beforeEach(async () => {
    const repository = new InMemoryCompletionRepository();

    const prerequisiteProvider: GateBPrerequisiteProvider = {
      async isTrancheAPaidOrSubmitted() {
        return true;
      },
    };

    service = new CompletionService(
      repository,
      secret,
      prerequisiteProvider
    );

    milestoneId = "milestone-http-test";

    const spec = await service.createCompletionSpec({
      milestoneId,
      spec: { target: "Install solar lights" },
      minAttestations: 5,
      windowDays: 7,
    });

    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    proofId = proof.id;

    app = express();
    app.use(express.json());

    app.use(
      "/api",
      createCompletionRouter(
        service,
        testAuthorization
      )
    );
  });

  // --------------------------------------------------
  // Authentication tests
  // --------------------------------------------------

  it("rejects proof review without authenticated reviewer identity", async () => {
    const unauthenticatedApp = express();

    unauthenticatedApp.use(express.json());

    unauthenticatedApp.use(
      "/api",
      createCompletionRouter(service)
    );

    const response = await request(unauthenticatedApp)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "approved",
        reason: "Proof verified",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toContain(
      "Authenticated reviewer identity"
    );
  });

  it("allows an authenticated reviewer to approve proof", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "approved",
        reason: "Completion proof verified",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.reviewerId).toBe(
      "trusted-reviewer-123"
    );

    expect(response.body.data.decision).toBe("approved");
  });

  it("rejects a reviewer who does not have permission", async () => {
    const restrictedAuthorization: CompletionAuthorization = {
      ...testAuthorization,
      canReviewProof: async () => false,
    };

    const restrictedApp = express();

    restrictedApp.use(express.json());

    restrictedApp.use(
      "/api",
      createCompletionRouter(
        service,
        restrictedAuthorization
      )
    );

    const response = await request(restrictedApp)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "approved",
        reason: "Proof verified",
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain(
      "not authorized"
    );
  });

  // --------------------------------------------------
  // Request identity validation tests
  // --------------------------------------------------

  it("rejects a forged reviewerId in the request body", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        reviewerId: "fake-reviewer",
        decision: "approved",
        reason: "Trying to forge reviewer identity",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("does not accept unexpected reviewer fields", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "approved",
        reason: "Proof verified",
        reviewerId: "attacker",
        admin: true,
      });

    expect(response.status).toBe(400);
  });

  // --------------------------------------------------
  // Proof review validation tests
  // --------------------------------------------------

  it("rejects an invalid proof review decision", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "maybe",
        reason: "Invalid decision",
      });

    expect(response.status).toBe(400);
  });

  it("rejects a proof review with an empty reason", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "approved",
        reason: "   ",
      });

    expect(response.status).toBe(400);
  });

  // --------------------------------------------------
  // Resource validation tests
  // --------------------------------------------------

  it("returns 404 when the milestone does not exist", async () => {
    const response = await request(app)
      .post("/api/milestones/nonexistent-milestone/proof/decision")
      .send({
        decision: "approved",
        reason: "Proof verified",
      });

    expect(response.status).toBe(404);
  });

  it("returns the submitted proof for the correct milestone", async () => {
    const response = await request(app)
      .post(`/api/milestones/${milestoneId}/proof/decision`)
      .send({
        decision: "rejected",
        reason: "Proof does not satisfy the completion requirements",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.submissionId).toBe(proofId);
    expect(response.body.data.decision).toBe("rejected");
  });
});
