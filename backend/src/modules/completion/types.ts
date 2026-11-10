export type AttestationResponse = "works" | "not_working";

export type ProofDecision = "approved" | "rejected" | "needs_more";

export interface CompletionSpec {
  id: string;
  milestoneId: string;
  spec: Record<string, unknown>;
  minAttestations: number;
  windowDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompletionSpecInput {
  milestoneId: string;
  spec: Record<string, unknown>;
  minAttestations: number;
  windowDays: number;
}

export interface ProofSubmission {
  id: string;
  specId: string;
  fileRefs: string[];
  checklist: Record<string, boolean>;
  aiSummary?: Record<string, unknown>;
  submittedAt: Date;
}

export interface CreateProofSubmissionInput {
  fileRefs: string[];
  checklist: Record<string, boolean>;
}

export interface ProofReview {
  id: string;
  submissionId: string;
  reviewerId: string;
  decision: ProofDecision;
  reason: string;
  createdAt: Date;
}

export interface CreateProofReviewInput {
  decision: ProofDecision;
  reason: string;
}

export interface Attestation {
  id: string;
  specId: string;
  householdId: string;
  tokenHash: string;
  response?: AttestationResponse;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface AttestationLink {
  householdId: string;
  token: string;
  expiresAt: Date;
}
