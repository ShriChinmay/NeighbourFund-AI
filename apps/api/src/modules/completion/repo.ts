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
  getSpecByMilestone(milestoneId: string): Promise<CompletionSpec | null>;

  // Proof submissions
  createProof(proof: ProofSubmission): Promise<ProofSubmission>;
  getProofById(id: string): Promise<ProofSubmission | null>;
  getProofBySpecId(specId: string): Promise<ProofSubmission | null>;

  // Proof reviews
  createProofReview(review: ProofReview): Promise<ProofReview>;
  getLatestProofReview(
    submissionId: string
  ): Promise<ProofReview | null>;

  // Attestations
  createAttestation(attestation: Attestation): Promise<Attestation>;

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

  updateAttestation(
    attestation: Attestation
  ): Promise<Attestation>;
}
