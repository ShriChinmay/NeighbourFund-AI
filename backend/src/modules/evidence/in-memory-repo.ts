
import type { EvidenceRepository } from "./repo.js";

import type {
  EvidenceRecord,
  InvoiceMetadata,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
  VerificationReviewAuditEvent,
} from "./types.js";

export class InMemoryEvidenceRepository implements EvidenceRepository {
  private records = new Map<string, EvidenceRecord>();
  private expenses = new Map<string, ExpenseRecord>();
  private flags = new Map<string, EvidenceFlag>();
  private reviews = new Map<string, VerificationReview>();
  private reviewAuditEvents = new Map<string, VerificationReviewAuditEvent>();

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

    const isDuplicateActiveFlag = [...this.flags.values()].some(
      (existing) =>
        existing.status !== "superseded" &&
        existing.expenseId === flag.expenseId &&
        existing.evidenceId === flag.evidenceId &&
        existing.flagType === flag.flagType
    );

    if (isDuplicateActiveFlag) {
      throw new Error("An active flag of this type already exists for this evidence.");
    }

    const stored: EvidenceFlag = {
      ...flag,
      status: flag.status ?? "active",
    };

    this.flags.set(stored.id, stored);
    return stored;
  }

  async getFlagsByExpense(expenseId: string): Promise<EvidenceFlag[]> {
    return [...this.flags.values()].filter(
      (flag) => flag.expenseId === expenseId
    );
  }

  async getFlagsByEvidence(evidenceId: string): Promise<EvidenceFlag[]> {
    return [...this.flags.values()].filter(
      (flag) => flag.evidenceId === evidenceId
    );
  }

  async supersedeActiveFlagsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<EvidenceFlag[]> {
    const now = new Date();
    const superseded: EvidenceFlag[] = [];

    for (const [id, flag] of this.flags.entries()) {
      if (
        flag.evidenceId !== evidenceId ||
        flag.status === "superseded"
      ) {
        continue;
      }

      const updated: EvidenceFlag = {
        ...flag,
        status: "superseded",
        supersededAt: now,
        supersededReason: reason,
      };

      this.flags.set(id, updated);
      superseded.push(updated);
    }

    return superseded;
  }

  async createVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    if (this.reviews.has(review.id)) {
      throw new Error("Verification review already exists.");
    }

    const stored: VerificationReview = {
      ...review,
      status: review.status ?? "active",
    };

    this.reviews.set(stored.id, stored);

    await this.createReviewAuditEvent({
      id: `audit_${stored.id}_created`,
      reviewId: stored.id,
      expenseId: stored.expenseId,
      evidenceId: stored.evidenceId,
      reviewerId: stored.reviewerId,
      newResolution: stored.resolution,
      newReason: stored.reason,
      action: "created",
      createdAt: new Date(),
    });

    return stored;
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

  async getReviewsByEvidence(evidenceId: string): Promise<VerificationReview[]> {
    return [...this.reviews.values()].filter(
      (review) => review.evidenceId === evidenceId
    );
  }

  async updateVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    const existing = this.reviews.get(review.id);

    if (!existing) {
      throw new Error("Verification review not found.");
    }

    if (
      existing.expenseId !== review.expenseId ||
      existing.evidenceId !== review.evidenceId ||
      existing.flagType !== review.flagType
    ) {
      throw new Error("Review identity fields cannot be changed.");
    }

    const updated: VerificationReview = {
      ...review,
      status: review.status ?? existing.status ?? "active",
    };

    this.reviews.set(updated.id, updated);

    await this.createReviewAuditEvent({
      id: `audit_${updated.id}_${Date.now()}_${this.reviewAuditEvents.size}`,
      reviewId: updated.id,
      expenseId: updated.expenseId,
      evidenceId: updated.evidenceId,
      reviewerId: updated.reviewerId,
      previousResolution: existing.resolution,
      newResolution: updated.resolution,
      previousReason: existing.reason,
      newReason: updated.reason,
      action: "updated",
      createdAt: new Date(),
    });

    return updated;
  }

  async createReviewAuditEvent(
    event: VerificationReviewAuditEvent
  ): Promise<VerificationReviewAuditEvent> {
    if (this.reviewAuditEvents.has(event.id)) {
      throw new Error("Review audit event already exists.");
    }

    this.reviewAuditEvents.set(event.id, event);
    return event;
  }

  async getReviewAuditHistory(
    reviewId: string
  ): Promise<VerificationReviewAuditEvent[]> {
    return [...this.reviewAuditEvents.values()]
      .filter((event) => event.reviewId === reviewId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getReviewAuditHistoryByEvidence(
    evidenceId: string
  ): Promise<VerificationReviewAuditEvent[]> {
    return [...this.reviewAuditEvents.values()]
      .filter((event) => event.evidenceId === evidenceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async supersedeReviewsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<VerificationReview[]> {
    const now = new Date();
    const superseded: VerificationReview[] = [];

    for (const [id, review] of this.reviews.entries()) {
      if (
        review.evidenceId !== evidenceId ||
        review.status === "superseded"
      ) {
        continue;
      }

      const updated: VerificationReview = {
        ...review,
        status: "superseded",
        supersededAt: now,
        supersededReason: reason,
        updatedAt: now,
      };

      this.reviews.set(id, updated);
      superseded.push(updated);

      await this.createReviewAuditEvent({
        id: `audit_${id}_superseded_${now.getTime()}`,
        reviewId: id,
        expenseId: review.expenseId,
        evidenceId,
        reviewerId: review.reviewerId,
        previousResolution: review.resolution,
        newResolution: review.resolution,
        previousReason: review.reason,
        newReason: reason,
        action: "superseded",
        createdAt: now,
      });
    }

    return superseded;
  }
}
