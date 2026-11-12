import { describe, it, expect, beforeEach } from "vitest";

import { CompletionService } from "./service.js";

import type {
  GateBPrerequisiteProvider,
} from "./service.js";

import type { CompletionRepository } from "./repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
} from "./types.js";

class InMemoryCompletionRepository
  implements CompletionRepository {
  specs = new Map<string, CompletionSpec>();
  proofs = new Map<string, ProofSubmission>();
  reviews = new Map<string, ProofReview>();
  attestations = new Map<string, Attestation>();

  async createSpec(spec: CompletionSpec) {
    if (
      [...this.specs.values()].some(
        (item) => item.milestoneId === spec.milestoneId
      )
    ) {
      throw new Error("Duplicate milestone specification.");
    }

    this.specs.set(spec.id, spec);
    return spec;
  }

  async getSpecById(id: string) {
    return this.specs.get(id) ?? null;
  }

  async getSpecByMilestone(milestoneId: string) {
    return (
      [...this.specs.values()].find(
        (item) => item.milestoneId === milestoneId
      ) ?? null
    );
  }

  async createProof(proof: ProofSubmission) {
    this.proofs.set(proof.id, proof);
    return proof;
  }

  async getProofById(id: string) {
    return this.proofs.get(id) ?? null;
  }

  async getProofBySpecId(specId: string) {
    return [...this.proofs.values()]
      .filter((item) => item.specId === specId)
      .reduce<ProofSubmission | null>((latest, item) => {
        if (!latest || item.submittedAt.getTime() >= latest.submittedAt.getTime()) {
          return item;
        }
        return latest;
      }, null);
  }

  async createProofReview(review: ProofReview) {
    this.reviews.set(review.id, review);
    return review;
  }

  async getLatestProofReview(submissionId: string) {
    const matchingReviews = [...this.reviews.values()].filter(
      (item) => item.submissionId === submissionId
    );

    return matchingReviews.reduce<ProofReview | null>(
      (latest, review) => {
        if (
          !latest ||
          review.createdAt.getTime() >= latest.createdAt.getTime()
        ) {
          return review;
        }

        return latest;
      },
      null
    );
  }

  async createAttestation(attestation: Attestation) {
    if (
      await this.getAttestationByHousehold(
        attestation.specId,
        attestation.householdId
      )
    ) {
      throw new Error("Household already invited.");
    }

    if (
      await this.getAttestationByTokenHash(
        attestation.tokenHash
      )
    ) {
      throw new Error("Duplicate token hash.");
    }

    this.attestations.set(attestation.id, attestation);
    return attestation;
  }


  async createAttestationsForMilestone(
    milestoneId: string,
    attestations: Attestation[]
  ): Promise<Attestation[]> {
    if (!attestations.length || attestations.length > 1000) {
      throw new Error("Invalid attestation batch size.");
    }

    const spec = await this.getSpecByMilestone(milestoneId);

    if (!spec) {
      throw new Error("Completion specification not found.");
    }

    if (attestations.some((a) => a.specId !== spec.id)) {
      throw new Error("Invalid completion specification.");
    }

    const householdIds = attestations.map((a) => a.householdId);
    const ids = attestations.map((a) => a.id);
    const tokenHashes = attestations.map((a) => a.tokenHash);

    if (
      new Set(householdIds).size !== householdIds.length ||
      new Set(ids).size !== ids.length ||
      new Set(tokenHashes).size !== tokenHashes.length
    ) {
      throw new Error("Duplicate attestation data.");
    }

    // Validate the entire batch before inserting.
    for (const a of attestations) {
      if (this.attestations.has(a.id)) {
        throw new Error("Attestation ID already exists.");
      }

      if (await this.getAttestationByHousehold(a.specId, a.householdId)) {
        throw new Error("Household already invited.");
      }

      if (await this.getAttestationByTokenHash(a.tokenHash)) {
        throw new Error("Duplicate token hash.");
      }
    }

    // Insert only after all validations pass.
    for (const a of attestations) {
      this.attestations.set(a.id, a);
    }

    return [...attestations];
  }

  async getAttestationByTokenHash(tokenHash: string) {
    return (
      [...this.attestations.values()].find(
        (item) => item.tokenHash === tokenHash
      ) ?? null
    );
  }

  async getAttestationByHousehold(
    specId: string,
    householdId: string
  ) {
    return (
      [...this.attestations.values()].find(
        (item) =>
          item.specId === specId &&
          item.householdId === householdId
      ) ?? null
    );
  }

  async getAttestationsBySpec(specId: string) {
    return [...this.attestations.values()].filter(
      (item) => item.specId === specId
    );
  }
  async redeemAttestation(
    id: string,
    response: "works" | "not_working",
    now: Date
  ): Promise<Attestation | null> {
    const existing = this.attestations.get(id);

    if (!existing) {
      return null;
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    if (existing.usedAt || existing.response) {
      return null;
    }

    const redeemed: Attestation = {
      ...existing,
      response,
      usedAt: now,
    };

    this.attestations.set(id, redeemed);

    return redeemed;
  }

  async updateAttestation(attestation: Attestation) {
    this.attestations.set(attestation.id, attestation);
    return attestation;
  }
}

describe("Completion Module", () => {
  let repo: InMemoryCompletionRepository;
  let service: CompletionService;
  let spec: CompletionSpec;
  let trancheAComplete: boolean;

  const secret = "test-secret-that-is-at-least-32-bytes-long";

  let prerequisiteProvider: GateBPrerequisiteProvider;

  beforeEach(async () => {
    repo = new InMemoryCompletionRepository();

    trancheAComplete = true;

    prerequisiteProvider = {
      async isTrancheAPaidOrSubmitted() {
        return trancheAComplete;
      },
    };

    service = new CompletionService(
      repo,
      secret,
      prerequisiteProvider,
      {
        async validateAttestationHouseholds() {
          return true;
        },
      }
  );

    spec = await service.createCompletionSpec({
      milestoneId: "milestone-1",
      spec: { target: "Install six solar lights" },
      minAttestations: 5,
      windowDays: 7,
    });
  });

  it("creates a completion specification", async () => {
    expect(spec.id).toBeTruthy();
    expect(spec.minAttestations).toBe(5);
    expect(await repo.getSpecById(spec.id)).toEqual(spec);
  });

  it("rejects invalid completion specifications", async () => {
    await expect(
      service.createCompletionSpec({
        milestoneId: "milestone-2",
        spec: {},
        minAttestations: 0,
        windowDays: 7,
      })
    ).rejects.toThrow("Minimum attestations");
  });

  it("rejects duplicate completion specifications for a milestone", async () => {
    await expect(
      service.createCompletionSpec({
        milestoneId: "milestone-1",
        spec: {},
        minAttestations: 5,
        windowDays: 7,
      })
    ).rejects.toThrow("already exists");
  });

  it("allows a new proof after the latest submission is rejected and preserves history", async () => {
    const first = await service.submitProof(spec.id, {
      fileRefs: ["proof/first.jpg"],
      checklist: { lightsInstalled: false },
    });

    await service.createProofReview(first.id, "reviewer-1", {
      decision: "rejected",
      reason: "Installation is incomplete",
    });

    const second = await service.submitProof(spec.id, {
      fileRefs: ["proof/second.jpg"],
      checklist: { lightsInstalled: true },
    });

    expect(second.id).not.toBe(first.id);
    expect(await repo.getProofById(first.id)).toEqual(first);
    expect(await repo.getProofBySpecId(spec.id)).toEqual(second);
    expect(await repo.getLatestProofReview(first.id)).toMatchObject({
      decision: "rejected",
      reason: "Installation is incomplete",
    });
  });

  it("evaluates the latest resubmission rather than the previously rejected proof", async () => {
    const first = await service.submitProof(spec.id, {
      fileRefs: ["proof/first.jpg"],
      checklist: { lightsInstalled: true },
    });
    await service.createProofReview(first.id, "reviewer-1", {
      decision: "rejected",
      reason: "First submission needs correction",
    });

    const second = await service.submitProof(spec.id, {
      fileRefs: ["proof/second.jpg"],
      checklist: { lightsInstalled: true },
    });
    await service.createProofReview(second.id, "reviewer-2", {
      decision: "needs_more",
      reason: "Latest submission needs clearer evidence",
    });

    const result = await service.getGateBEligibility(spec.id);
    expect(result.proofApproved).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("allows a new proof after a needs_more decision", async () => {
    const first = await service.submitProof(spec.id, {
      fileRefs: ["proof/first.jpg"],
      checklist: { testingComplete: false },
    });
    await service.createProofReview(first.id, "reviewer-1", {
      decision: "needs_more",
      reason: "Provide testing evidence",
    });

    const second = await service.submitProof(spec.id, {
      fileRefs: ["proof/second.jpg"],
      checklist: { testingComplete: true },
    });

    expect(second.id).not.toBe(first.id);
    expect(await repo.getProofBySpecId(spec.id)).toEqual(second);
  });

  it("blocks resubmission while the latest proof is awaiting review", async () => {
    await service.submitProof(spec.id, {
      fileRefs: ["proof/first.jpg"],
      checklist: { lightsInstalled: true },
    });

    await expect(
      service.submitProof(spec.id, {
        fileRefs: ["proof/second.jpg"],
        checklist: { lightsInstalled: true },
      })
    ).rejects.toThrow("awaiting review");
  });

  it("blocks resubmission after the latest proof is approved", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/first.jpg"],
      checklist: { lightsInstalled: true },
    });
    await service.createProofReview(proof.id, "reviewer-1", {
      decision: "approved",
      reason: "Completion verified",
    });

    await expect(
      service.submitProof(spec.id, {
        fileRefs: ["proof/second.jpg"],
        checklist: { lightsInstalled: true },
      })
    ).rejects.toThrow("cannot be resubmitted");
  });

  it("submits valid completion proof", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    expect(proof.specId).toBe(spec.id);
    expect(proof.fileRefs).toHaveLength(1);
  });

  it("rejects proof without files", async () => {
    await expect(
      service.submitProof(spec.id, {
        fileRefs: [],
        checklist: { lightsInstalled: true },
      })
    ).rejects.toThrow("At least one proof file");
  });

  it("rejects an empty completion checklist", async () => {
    await expect(
      service.submitProof(spec.id, {
        fileRefs: ["proof/photo-1.jpg"],
        checklist: {},
      })
    ).rejects.toThrow("checklist");
  });

  it("rejects duplicate household invitations", async () => {
    await service.generateAttestationLinks(spec.id, [
      "household-1",
    ]);

    await expect(
      service.generateAttestationLinks(spec.id, [
        "household-1",
      ])
    ).rejects.toThrow("already been invited");
  });

  it("rejects duplicate household IDs in one invitation request", async () => {
    await expect(
      service.generateAttestationLinks(spec.id, [
        "household-1",
        "household-1",
      ])
    ).rejects.toThrow("Duplicate household IDs");
  });

  it("generates attestation links without storing raw tokens", async () => {
    const [link] = await service.generateAttestationLinks(
      spec.id,
      ["household-1"]
    );

    const saved = await repo.getAttestationByHousehold(
      spec.id,
      "household-1"
    );

    expect(link.token).toBeTruthy();
    expect(saved?.tokenHash).not.toBe(link.token);
  });

  it("accepts a valid attestation response only once", async () => {
    const [link] = await service.generateAttestationLinks(
      spec.id,
      ["household-1"]
    );

    const result = await service.submitAttestation(
      link.token,
      "works"
    );

    expect(result.response).toBe("works");

    await expect(
      service.submitAttestation(link.token, "works")
    ).rejects.toThrow("already been used");
  });

  it("rejects an expired attestation link", async () => {
    const [link] = await service.generateAttestationLinks(
      spec.id,
      ["household-1"]
    );

    const saved = await repo.getAttestationByHousehold(
      spec.id,
      "household-1"
    );

    if (!saved) {
      throw new Error("Attestation not found");
    }

    await repo.updateAttestation({
      ...saved,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.submitAttestation(link.token, "works")
    ).rejects.toThrow("expired");
  });

  it("rejects an invalid attestation token", async () => {
    await expect(
      service.getAttestationByToken("invalid-token")
    ).rejects.toThrow("Invalid attestation token");
  });

  it("blocks Gate B with only four distinct household attestations", async () => {
    const households = ["h1", "h2", "h3", "h4"];

    const links = await service.generateAttestationLinks(
      spec.id,
      households
    );

    for (const link of links) {
      await service.submitAttestation(link.token, "works");
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.worksCount).toBe(4);
    expect(result.eligible).toBe(false);
  });

  it("allows Gate B with five distinct works responses, approved proof and completed Tranche A", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(
      proof.id,
      "reviewer-1",
      {
        decision: "approved",
        reason: "Completion proof verified",
      }
    );

    const links = await service.generateAttestationLinks(
      spec.id,
      ["h1", "h2", "h3", "h4", "h5"]
    );

    for (const link of links) {
      await service.submitAttestation(link.token, "works");
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.worksCount).toBe(5);
    expect(result.proofApproved).toBe(true);
    expect(result.trancheAComplete).toBe(true);
    expect(result.eligible).toBe(true);
  });

  it("blocks Gate B when Tranche A has not been paid or submitted", async () => {
    trancheAComplete = false;

    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(
      proof.id,
      "reviewer-1",
      {
        decision: "approved",
        reason: "Proof reviewed",
      }
    );

    const links = await service.generateAttestationLinks(
      spec.id,
      ["h1", "h2", "h3", "h4", "h5"]
    );

    for (const link of links) {
      await service.submitAttestation(link.token, "works");
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.trancheAComplete).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      "Tranche A has not been confirmed as paid or submitted."
    );
  });

  it("blocks Gate B when any household reports not_working", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(
      proof.id,
      "reviewer-1",
      {
        decision: "approved",
        reason: "Proof reviewed",
      }
    );

    const links = await service.generateAttestationLinks(
      spec.id,
      ["h1", "h2", "h3", "h4", "h5"]
    );

    for (let i = 0; i < links.length; i++) {
      await service.submitAttestation(
        links[i].token,
        i === 4 ? "not_working" : "works"
      );
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.hasNotWorking).toBe(true);
    expect(result.eligible).toBe(false);
  });

  it("blocks Gate B when proof has not been submitted", async () => {
    const result = await service.getGateBEligibility(spec.id);

    expect(result.proofApproved).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("blocks Gate B when proof has not been approved", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(
      proof.id,
      "reviewer-1",
      {
        decision: "needs_more",
        reason: "Additional evidence is required",
      }
    );

    const result = await service.getGateBEligibility(spec.id);

    expect(result.proofApproved).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("stores the authenticated reviewer identity separately from review input", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    const review = await service.createProofReview(
      proof.id,
      "trusted-reviewer-123",
      {
        decision: "approved",
        reason: "Verified",
      }
    );

    expect(review.reviewerId).toBe("trusted-reviewer-123");
  });

  it("rejects a missing reviewer identity", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await expect(
      service.createProofReview(
        proof.id,
        "",
        {
          decision: "approved",
          reason: "Verified",
        }
      )
    ).rejects.toThrow("Authenticated reviewer identity");
  });

  it("rejects proof review for a nonexistent submission", async () => {
    await expect(
      service.createProofReview(
        "missing-proof",
        "reviewer-1",
        {
          decision: "approved",
          reason: "Verified",
        }
      )
    ).rejects.toThrow("Proof submission not found");
  });

  it("blocks Gate B when the latest proof review changes to needs_more", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(proof.id, "reviewer-1", {
      decision: "approved",
      reason: "Initially approved",
    });

    await service.createProofReview(proof.id, "reviewer-2", {
      decision: "needs_more",
      reason: "Additional proof required",
    });

    const links = await service.generateAttestationLinks(
      spec.id,
      ["h1", "h2", "h3", "h4", "h5"]
    );

    for (const link of links) {
      await service.submitAttestation(link.token, "works");
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.proofApproved).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("uses the latest approved proof review after an earlier needs_more decision", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(proof.id, "reviewer-1", {
      decision: "needs_more",
      reason: "More evidence required",
    });

    await service.createProofReview(proof.id, "reviewer-2", {
      decision: "approved",
      reason: "Additional evidence verified",
    });

    const links = await service.generateAttestationLinks(
      spec.id,
      ["h1", "h2", "h3", "h4", "h5"]
    );

    for (const link of links) {
      await service.submitAttestation(link.token, "works");
    }

    const result = await service.getGateBEligibility(spec.id);

    expect(result.proofApproved).toBe(true);
    expect(result.eligible).toBe(true);
  });

  it("blocks Gate B when the latest proof review is rejected", async () => {
    const proof = await service.submitProof(spec.id, {
      fileRefs: ["proof/photo-1.jpg"],
      checklist: { lightsInstalled: true },
    });

    await service.createProofReview(proof.id, "reviewer-1", {
      decision: "rejected",
      reason: "Proof does not meet requirements",
    });

    const result = await service.getGateBEligibility(spec.id);

    expect(result.proofApproved).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("rejects Gate B eligibility for an unknown milestone", async () => {
    await expect(
      service.getGateBEligibility("unknown-milestone")
    ).rejects.toThrow("Completion specification not found");
  });
});
