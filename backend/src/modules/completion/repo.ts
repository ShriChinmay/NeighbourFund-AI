
import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
} from "./types.js";

export interface CompletionRepository {
  // Completion specifications
  createSpec(spec: CompletionSpec): Promise<CompletionSpec>;

  getSpecById(id: string): Promise<CompletionSpec | null>;

  getSpecByMilestone(
    milestoneId: string
  ): Promise<CompletionSpec | null>;

  // Proof submissions
  createProof(proof: ProofSubmission): Promise<ProofSubmission>;

  getProofById(id: string): Promise<ProofSubmission | null>;

  getProofBySpecId(
    specId: string
  ): Promise<ProofSubmission | null>;

  // Proof reviews
  createProofReview(review: ProofReview): Promise<ProofReview>;

  getLatestProofReview(
    submissionId: string
  ): Promise<ProofReview | null>;

  // Attestations
  createAttestation(
    attestation: Attestation
  ): Promise<Attestation>;

  getAttestationByTokenHash(
    tokenHash: string
  ): Promise<Attestation | null>;

  getAttestationByHousehold(
    specId: string,
    householdId: string
  ): Promise<Attestation | null>;

  getAttestationsBySpec(
    specId: string
  ): Promise<Attestation[]>;

  /**
   * Atomically creates all attestations for a milestone.
   *
   * Implementations must:
   * - Verify that the milestone exists.
   * - Verify that every household belongs to the milestone's project.
   * - Verify that all attestations belong to the same completion spec
   *   associated with the milestone.
   * - Reject duplicate household invitations.
   * - Insert the entire batch atomically.
   * - Roll back all inserts if any operation fails.
   *
   * PostgreSQL implementations must perform ownership validation
   * and inserts inside the same database transaction.
   */
  createAttestationsForMilestone(
    milestoneId: string,
    attestations: Attestation[]
  ): Promise<Attestation[]>;

  /**
   * Atomically redeems an unused, unexpired attestation.
   *
   * Returns the updated attestation if redemption succeeds.
   * Returns null if it is already used, expired, or unavailable.
   *
   * PostgreSQL implementations must perform this as a conditional
   * UPDATE within a transaction or equivalent atomic operation.
   */
  redeemAttestation(
    id: string,
    response: "works" | "not_working",
    now: Date
  ): Promise<Attestation | null>;

  updateAttestation(
    attestation: Attestation
  ): Promise<Attestation>;
}
