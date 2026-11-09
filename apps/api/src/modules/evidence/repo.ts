import type {
  EvidenceRecord,
  InvoiceMetadata,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
} from "./types.js";

export interface EvidenceRepository {
  // Evidence document operations
  createEvidence(
    evidence: EvidenceRecord
  ): Promise<EvidenceRecord>;

  getEvidenceById(
    id: string
  ): Promise<EvidenceRecord | null>;

  getEvidenceByProject(
    projectId: string
  ): Promise<EvidenceRecord[]>;

  updateEvidence(
    evidence: EvidenceRecord
  ): Promise<EvidenceRecord>;

  updateExtractedMetadata(
    id: string,
    metadata: InvoiceMetadata,
    provider: string,
    confidence?: Record<string, number>
  ): Promise<EvidenceRecord>;

  // Expense operations
  createExpense(
    expense: ExpenseRecord
  ): Promise<ExpenseRecord>;

  getExpenseById(
    id: string
  ): Promise<ExpenseRecord | null>;

  getExpensesByProject(
    projectId: string
  ): Promise<ExpenseRecord[]>;

  updateExpense(
    expense: ExpenseRecord
  ): Promise<ExpenseRecord>;

  // Evidence discrepancy operations
  createEvidenceFlag(
    flag: EvidenceFlag
  ): Promise<EvidenceFlag>;

  getFlagsByExpense(
    expenseId: string
  ): Promise<EvidenceFlag[]>;

  // Verification review operations
  createVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview>;

  getVerificationReviewById(
    id: string
  ): Promise<VerificationReview | null>;

  getReviewsByExpense(
    expenseId: string
  ): Promise<VerificationReview[]>;

  updateVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview>;
}
