
import type {
  EvidenceRecord,
  InvoiceMetadata,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
  VerificationReviewAuditEvent,
} from "./types.js";

export interface EvidenceRepository {
  // Evidence document operations
  createEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord>;

  getEvidenceById(id: string): Promise<EvidenceRecord | null>;

  getEvidenceByProject(projectId: string): Promise<EvidenceRecord[]>;

  updateEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord>;

  updateExtractedMetadata(
    id: string,
    metadata: InvoiceMetadata,
    provider: string,
    confidence?: Record<string, number>
  ): Promise<EvidenceRecord>;

  // Expense operations
  createExpense(expense: ExpenseRecord): Promise<ExpenseRecord>;

  getExpenseById(id: string): Promise<ExpenseRecord | null>;

  getExpensesByProject(projectId: string): Promise<ExpenseRecord[]>;

  updateExpense(expense: ExpenseRecord): Promise<ExpenseRecord>;

  // Evidence discrepancy operations
  createEvidenceFlag(flag: EvidenceFlag): Promise<EvidenceFlag>;

  getFlagsByExpense(expenseId: string): Promise<EvidenceFlag[]>;

  getFlagsByEvidence(evidenceId: string): Promise<EvidenceFlag[]>;

  supersedeActiveFlagsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<EvidenceFlag[]>;

  // Verification review operations
  createVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview>;

  getVerificationReviewById(
    id: string
  ): Promise<VerificationReview | null>;

  getReviewsByExpense(expenseId: string): Promise<VerificationReview[]>;

  getReviewsByEvidence(evidenceId: string): Promise<VerificationReview[]>;

  updateVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview>;

  /**
   * Atomically updates a verification review and appends
   * its corresponding audit event.
   */
  resolveVerificationReviewWithAudit(
    review: VerificationReview,
    event: VerificationReviewAuditEvent
  ): Promise<VerificationReview>;

  // Append-only review audit history
  createReviewAuditEvent(
    event: VerificationReviewAuditEvent
  ): Promise<VerificationReviewAuditEvent>;

  getReviewAuditHistory(
    reviewId: string
  ): Promise<VerificationReviewAuditEvent[]>;

  getReviewAuditHistoryByEvidence(
    evidenceId: string
  ): Promise<VerificationReviewAuditEvent[]>;

  // Invalidate stale review decisions without deleting history.
  supersedeReviewsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<VerificationReview[]>;

  /**
   * Atomically supersedes active evidence flags and verification
   * reviews associated with the specified evidence.
   */
  invalidateEvidenceReviews(
    evidenceId: string,
    reason: string
  ): Promise<void>;
}
