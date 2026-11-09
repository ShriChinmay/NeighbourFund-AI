import type { CompletionRepository } from "./repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
} from "./types.js";

export class InMemoryCompletionRepository
  implements CompletionRepository
{
  private specs = new Map<string, CompletionSpec>();
  private proofs = new Map<string, ProofSubmission>();
  private reviews = new Map<string, ProofReview>();
  private attestations = new Map<string, Attestation>();

  // --------------------------------------------------
  // Completion specifications
  // --------------------------------------------------

  async createSpec(spec: CompletionSpec): Promise<CompletionSpec> {
    if (this.specs.has(spec.id)) {
      throw new Error("Completion specification ID already exists.");
    }

    const duplicateMilestone = [...this.specs.values()].some(
      (existing) => existing.milestoneId === spec.milestoneId
    );

    if (duplicateMilestone) {
      throw new Error(
        "A completion specification already exists for this milestone."
      );
    }

    this.specs.set(spec.id, spec);

    return spec;
  }

  async getSpecById(id: string): Promise<CompletionSpec | null> {
    return this.specs.get(id) ?? null;
  }

  async getSpecByMilestone(
    milestoneId: string
  ): Promise<CompletionSpec | null> {
    return (
      [...this.specs.values()].find(
        (spec) => spec.milestoneId === milestoneId
      ) ?? null
    );
  }

  // --------------------------------------------------
  // Proof submissions
  // --------------------------------------------------

  async createProof(proof: ProofSubmission): Promise<ProofSubmission> {
    if (this.proofs.has(proof.id)) {
      throw new Error("Proof submission ID already exists.");
    }

    const specExists = this.specs.has(proof.specId);

    if (!specExists) {
      throw new Error(
        "Cannot submit proof for a nonexistent completion specification."
      );
    }

    const duplicateProof = [...this.proofs.values()].some(
      (existing) => existing.specId === proof.specId
    );

    if (duplicateProof) {
      throw new Error(
        "A proof submission already exists for this completion specification."
      );
    }

    this.proofs.set(proof.id, proof);

    return proof;
  }

  async getProofById(id: string): Promise<ProofSubmission | null> {
    return this.proofs.get(id) ?? null;
  }

  async getProofBySpecId(
    specId: string
  ): Promise<ProofSubmission | null> {
    return (
      [...this.proofs.values()].find(
        (proof) => proof.specId === specId
      ) ?? null
    );
  }

  // --------------------------------------------------
  // Proof reviews
  // --------------------------------------------------

  async createProofReview(review: ProofReview): Promise<ProofReview> {
    if (this.reviews.has(review.id)) {
      throw new Error("Proof review ID already exists.");
    }

    const proofExists = this.proofs.has(review.submissionId);

    if (!proofExists) {
      throw new Error("Proof submission not found.");
    }

    if (!review.reviewerId.trim()) {
      throw new Error("Reviewer ID is required.");
    }

    if (!review.reason.trim()) {
      throw new Error("Proof review reason is required.");
    }

    this.reviews.set(review.id, review);

    return review;
  }

  async getLatestProofReview(
    submissionId: string
  ): Promise<ProofReview | null> {
    const matchingReviews = [...this.reviews.values()].filter(
      (review) => review.submissionId === submissionId
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

  // --------------------------------------------------
  // Attestations
  // --------------------------------------------------

  async createAttestation(
    attestation: Attestation
  ): Promise<Attestation> {
    if (this.attestations.has(attestation.id)) {
      throw new Error("Attestation ID already exists.");
    }

    if (!this.specs.has(attestation.specId)) {
      throw new Error(
        "Cannot create attestation for a nonexistent completion specification."
      );
    }

    if (!attestation.householdId.trim()) {
      throw new Error("Household ID is required.");
    }

    if (!attestation.tokenHash.trim()) {
      throw new Error("Attestation token hash is required.");
    }

    const duplicateHousehold =
      await this.getAttestationByHousehold(
        attestation.specId,
        attestation.householdId
      );

    if (duplicateHousehold) {
      throw new Error(
        "Household has already been invited."
      );
    }

    const existingToken =
      await this.getAttestationByTokenHash(
        attestation.tokenHash
      );

    if (existingToken) {
      throw new Error(
        "Attestation token already exists."
      );
    }

    this.attestations.set(attestation.id, attestation);

    return attestation;
  }

  async getAttestationByTokenHash(
    tokenHash: string
  ): Promise<Attestation | null> {
    return (
      [...this.attestations.values()].find(
        (item) => item.tokenHash === tokenHash
      ) ?? null
    );
  }

  async getAttestationByHousehold(
    specId: string,
    householdId: string
  ): Promise<Attestation | null> {
    return (
      [...this.attestations.values()].find(
        (item) =>
          item.specId === specId &&
          item.householdId === householdId
      ) ?? null
    );
  }

  async getAttestationsBySpec(
    specId: string
  ): Promise<Attestation[]> {
    return [...this.attestations.values()].filter(
      (item) => item.specId === specId
    );
  }

  async updateAttestation(
    attestation: Attestation
  ): Promise<Attestation> {
    const existing = this.attestations.get(attestation.id);

    if (!existing) {
      throw new Error("Attestation not found.");
    }

    // Prevent changing the identity of an existing invitation.
    if (
      existing.specId !== attestation.specId ||
      existing.householdId !== attestation.householdId ||
      existing.tokenHash !== attestation.tokenHash
    ) {
      throw new Error(
        "Attestation identity and token cannot be changed."
      );
    }

    // An already-used invitation cannot be submitted again.
    if (existing.usedAt || existing.response) {
      throw new Error(
        "Attestation link has already been used."
      );
    }

    // Prevent an update from storing an incomplete response.
    if (
      !attestation.usedAt &&
      attestation.response
    ) {
      throw new Error(
        "Attestation response must include a usage timestamp."
      );
    }

    // Prevent changing an existing expiration date.
    if (
      existing.expiresAt.getTime() !==
      attestation.expiresAt.getTime()
    ) {
      throw new Error(
        "Attestation expiration cannot be changed."
      );
    }

    this.attestations.set(attestation.id, attestation);

    return attestation;
  }
}
