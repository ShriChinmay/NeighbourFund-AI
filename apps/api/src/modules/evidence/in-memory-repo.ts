import type { EvidenceRepository } from "./repo.js";

import type {
  EvidenceRecord,
  InvoiceMetadata,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
} from "./types.js";

export class InMemoryEvidenceRepository implements EvidenceRepository {
  private records = new Map<string, EvidenceRecord>();
  private expenses = new Map<string, ExpenseRecord>();
  private flags = new Map<string, EvidenceFlag>();
  private reviews = new Map<string, VerificationReview>();

  async createEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    if (this.records.has(evidence.id)) {
      throw new Error("Evidence record already exists.");
    }

    this.records.set(evidence.id, evidence);
    return evidence;
  }

  async getEvidenceById(id: string): Promise<EvidenceRecord | null> {
    return this.records.get(id) ?? null;
  }

  async getEvidenceByProject(projectId: string): Promise<EvidenceRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.projectId === projectId
    );
  }

  async updateEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    const existing = this.records.get(evidence.id);

    if (!existing) {
      throw new Error("Evidence record not found.");
    }

    if (
      evidence.projectId !== existing.projectId ||
      evidence.milestoneId !== existing.milestoneId ||
      evidence.expenseId !== existing.expenseId ||
      evidence.uploadedBy !== existing.uploadedBy ||
      evidence.storageKey !== existing.storageKey ||
      evidence.originalFileName !== existing.originalFileName ||
      evidence.mimeType !== existing.mimeType ||
      evidence.fileSize !== existing.fileSize
    ) {
      throw new Error("Immutable evidence fields cannot be changed.");
    }

    this.records.set(evidence.id, evidence);
    return evidence;
  }

  async updateExtractedMetadata(
    id: string,
    metadata: InvoiceMetadata,
    provider: string,
    confidence?: Record<string, number>
  ): Promise<EvidenceRecord> {
    const existing = await this.getEvidenceById(id);

    if (!existing) {
      throw new Error("Evidence record not found.");
    }

    const updated: EvidenceRecord = {
      ...existing,
      extractedMetadata: metadata,
      extractionProvider: provider,
      confidence,
      status: "extracted",
      updatedAt: new Date(),
    };

    this.records.set(id, updated);
    return updated;
  }

  async createExpense(expense: ExpenseRecord): Promise<ExpenseRecord> {
    if (this.expenses.has(expense.id)) {
      throw new Error("Expense record already exists.");
    }

    this.expenses.set(expense.id, expense);
    return expense;
  }

  async getExpenseById(id: string): Promise<ExpenseRecord | null> {
    return this.expenses.get(id) ?? null;
  }

  async getExpensesByProject(projectId: string): Promise<ExpenseRecord[]> {
    return [...this.expenses.values()].filter(
      (expense) => expense.projectId === projectId
    );
  }

  async updateExpense(expense: ExpenseRecord): Promise<ExpenseRecord> {
    if (!this.expenses.has(expense.id)) {
      throw new Error("Expense record not found.");
    }

    this.expenses.set(expense.id, expense);
    return expense;
  }

  async createEvidenceFlag(flag: EvidenceFlag): Promise<EvidenceFlag> {
    if (this.flags.has(flag.id)) {
      throw new Error("Evidence flag already exists.");
    }

    this.flags.set(flag.id, flag);
    return flag;
  }

  async getFlagsByExpense(expenseId: string): Promise<EvidenceFlag[]> {
    return [...this.flags.values()].filter(
      (flag) => flag.expenseId === expenseId
    );
  }

  async createVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    if (this.reviews.has(review.id)) {
      throw new Error("Verification review already exists.");
    }

    this.reviews.set(review.id, review);
    return review;
  }

  async getVerificationReviewById(
    id: string
  ): Promise<VerificationReview | null> {
    return this.reviews.get(id) ?? null;
  }

  async getReviewsByExpense(expenseId: string): Promise<VerificationReview[]> {
    return [...this.reviews.values()].filter(
      (review) => review.expenseId === expenseId
    );
  }

  async updateVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    if (!this.reviews.has(review.id)) {
      throw new Error("Verification review not found.");
    }

    this.reviews.set(review.id, review);
    return review;
  }
}
