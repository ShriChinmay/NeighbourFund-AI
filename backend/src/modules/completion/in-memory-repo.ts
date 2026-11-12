
import type { CompletionRepository } from "./repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
} from "./types.js";

export class InMemoryCompletionRepository implements CompletionRepository {
  private specs = new Map<string, CompletionSpec>();
  private proofs = new Map<string, ProofSubmission>();
  private reviews = new Map<string, ProofReview>();
  private attestations = new Map<string, Attestation>();

  // Completion specifications

  async createSpec(spec: CompletionSpec): Promise<CompletionSpec> {
    if (this.specs.has(spec.id)) {
      throw new Error("Completion specification ID already exists.");
    }

    if (
      [...this.specs.values()].some(
        (item) => item.milestoneId === spec.milestoneId
      )
    ) {
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
        (item) => item.milestoneId === milestoneId
      ) ?? null
    );
  }

  // Proof submissions

  async createProof(proof: ProofSubmission): Promise<ProofSubmission> {
    if (this.proofs.has(proof.id)) {
      throw new Error("Proof submission ID already exists.");
    }

    if (!this.specs.has(proof.specId)) {
      throw new Error(
        "Cannot submit proof for a nonexistent completion specification."
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
    return [...this.proofs.values()]
      .filter((item) => item.specId === specId)
      .reduce<ProofSubmission | null>((latest, item) => {
        if (
          !latest ||
          item.submittedAt.getTime() >= latest.submittedAt.getTime()
        ) {
          return item;
        }

        return latest;
      }, null);
  }

  // Proof reviews

  async createProofReview(review: ProofReview): Promise<ProofReview> {
    if (this.reviews.has(review.id)) {
      throw new Error("Proof review ID already exists.");
    }

    if (!this.proofs.has(review.submissionId)) {
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
    return [...this.reviews.values()]
      .filter((item) => item.submissionId === submissionId)
      .reduce<ProofReview | null>((latest, item) => {
        if (
          !latest ||
          item.createdAt.getTime() >= latest.createdAt.getTime()
        ) {
          return item;
        }

        return latest;
      }, null);
  }

  // Attestations

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

    if (
      await this.getAttestationByHousehold(
        attestation.specId,
        attestation.householdId
      )
    ) {
      throw new Error("Household has already been invited.");
    }

    if (
      await this.getAttestationByTokenHash(attestation.tokenHash)
    ) {
      throw new Error("Attestation token already exists.");
    }

    this.attestations.set(attestation.id, attestation);
    return attestation;
  }

  /**
   * Atomically creates a batch of attestations.
   *
   * All validation is completed before inserting any records.
   * This mirrors the all-or-nothing behavior of the PostgreSQL
   * implementation.
   *
   * Household ownership is validated by the service's
   * ownership provider. This repository validates the
   * milestone/spec association.
   */
  async createAttestationsForMilestone(
    milestoneId: string,
    attestations: Attestation[]
  ): Promise<Attestation[]> {
    if (!milestoneId?.trim()) {
      throw new Error("Milestone ID is required.");
    }

    if (
      !Array.isArray(attestations) ||
      attestations.length === 0 ||
      attestations.length > 1000
    ) {
      throw new Error("Invalid attestation batch size.");
    }

    const spec = await this.getSpecByMilestone(milestoneId);

    if (!spec) {
      throw new Error(
        "Completion specification not found for this milestone."
      );
    }

    const householdIds = attestations.map(
      (item) => item.householdId
    );

    const attestationIds = attestations.map(
      (item) => item.id
    );

    const tokenHashes = attestations.map(
      (item) => item.tokenHash
    );

    if (attestations.some((item) => item.specId !== spec.id)) {
      throw new Error(
        "All attestations must belong to the milestone's completion specification."
      );
    }

    if (
      attestations.some(
        (item) =>
          !item.id?.trim() ||
          !item.householdId?.trim() ||
          !item.tokenHash?.trim()
      )
    ) {
      throw new Error("Attestation fields are required.");
    }

    // Check duplicates within the batch.
    if (
      new Set(householdIds).size !== householdIds.length ||
      new Set(attestationIds).size !== attestationIds.length ||
      new Set(tokenHashes).size !== tokenHashes.length
    ) {
      throw new Error(
        "Duplicate household IDs, attestation IDs or token hashes are not allowed."
      );
    }

    // Validate every record against existing records first.
    for (const attestation of attestations) {
      if (this.attestations.has(attestation.id)) {
        throw new Error("Attestation ID already exists.");
      }

      if (
        await this.getAttestationByHousehold(
          attestation.specId,
          attestation.householdId
        )
      ) {
        throw new Error(
          `Household ${attestation.householdId} has already been invited.`
        );
      }

      if (
        await this.getAttestationByTokenHash(
          attestation.tokenHash
        )
      ) {
        throw new Error("Attestation token already exists.");
      }
    }

    // All validation passed. Insert the entire batch.
    for (const attestation of attestations) {
      this.attestations.set(attestation.id, attestation);
    }

    return [...attestations];
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

  // Atomic attestation redemption

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

  async updateAttestation(
    attestation: Attestation
  ): Promise<Attestation> {
    const existing = this.attestations.get(attestation.id);

    if (!existing) {
      throw new Error("Attestation not found.");
    }

    if (
      existing.specId !== attestation.specId ||
      existing.householdId !== attestation.householdId ||
      existing.tokenHash !== attestation.tokenHash
    ) {
      throw new Error(
        "Attestation identity and token cannot be changed."
      );
    }

    if (existing.usedAt || existing.response) {
      throw new Error("Attestation link has already been used.");
    }

    if (attestation.response && !attestation.usedAt) {
      throw new Error(
        "Attestation response must include a usage timestamp."
      );
    }

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
