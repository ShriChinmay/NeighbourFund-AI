
import { randomUUID } from "node:crypto";

import type { EvidenceRepository } from "./repo.js";

import type {
  EvidenceRecord,
  CreateEvidenceInput,
  InvoiceMetadata,
  InvoiceExtractionResult,
  EvidenceFileType,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
  FlagType,
  ReviewResolution,
} from "./types.js";

import {
  createEvidenceSchema,
  invoiceMetadataSchema,
  extractionConfidenceSchema,
  createExpenseSchema,
  reviewResolutionSchema,
  MAX_EVIDENCE_FILE_SIZE,
  ALLOWED_EVIDENCE_MIME_TYPES,
} from "./schemas.js";

// --------------------------------------------------
// Invoice extraction provider interface
// --------------------------------------------------

export interface InvoiceExtractionProvider {
  extractInvoice(
    evidence: EvidenceRecord
  ): Promise<InvoiceExtractionResult>;
}

// --------------------------------------------------
// Metadata comparison helper
// --------------------------------------------------

function normalizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeMetadata);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizeMetadata(item)])
    );
  }

  return value;
}

function metadataChanged(
  previous?: InvoiceMetadata,
  next?: InvoiceMetadata
): boolean {
  return (
    JSON.stringify(normalizeMetadata(previous ?? {})) !==
    JSON.stringify(normalizeMetadata(next ?? {}))
  );
}

function isUnresolvedReview(review: VerificationReview): boolean {
  return (
    review.status !== "superseded" &&
    (
      review.resolution === undefined ||
      review.resolution === "more_info"
    )
  );
}

function isActiveReview(review: VerificationReview): boolean {
  return review.status !== "superseded";
}

// --------------------------------------------------
// Evidence Service
// --------------------------------------------------

export class EvidenceService {
  constructor(
    private readonly repo: EvidenceRepository,
    private readonly extractionProvider?: InvoiceExtractionProvider
  ) {}

  // --------------------------------------------------
  // 1. Validate uploaded evidence metadata
  // --------------------------------------------------

  private validateUpload(input: CreateEvidenceInput): void {
    const result = createEvidenceSchema.safeParse(input);

    if (!result.success) {
      throw new Error(
        result.error.issues
          .map((issue) => issue.message)
          .join("; ")
      );
    }

    if (
      !ALLOWED_EVIDENCE_MIME_TYPES.includes(
        input.mimeType as EvidenceFileType
      )
    ) {
      throw new Error("Unsupported evidence file type.");
    }

    if (input.fileSize > MAX_EVIDENCE_FILE_SIZE) {
      throw new Error("Evidence file exceeds the 10 MB limit.");
    }
  }

  // --------------------------------------------------
  // 2. Invalidate stale evidence decisions
  // --------------------------------------------------

  private async invalidateEvidenceReviews(
    evidenceId: string,
    reason: string
  ): Promise<void> {
    await this.repo.supersedeActiveFlagsByEvidence(
      evidenceId,
      reason
    );

    await this.repo.supersedeReviewsByEvidence(
      evidenceId,
      reason
    );
  }

  // --------------------------------------------------
  // 3. Create evidence record
  // --------------------------------------------------

  async createEvidence(
    input: CreateEvidenceInput
  ): Promise<EvidenceRecord> {
    this.validateUpload(input);

    if (input.expenseId) {
      const expense = await this.repo.getExpenseById(input.expenseId);

      if (!expense) {
        throw new Error("Expense record not found.");
      }

      if (expense.projectId !== input.projectId) {
        throw new Error(
          "Expense does not belong to the specified project."
        );
      }
    }

    const now = new Date();

    const evidence: EvidenceRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      milestoneId: input.milestoneId,
      expenseId: input.expenseId,
      uploadedBy: input.uploadedBy,
      originalFileName: input.originalFileName,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      status: "uploaded",
      uploadedAt: now,
      updatedAt: now,
    };

    return this.repo.createEvidence(evidence);
  }

  // --------------------------------------------------
  // 4. Retrieve evidence by ID
  // --------------------------------------------------

  async getEvidenceById(
    id: string
  ): Promise<EvidenceRecord> {
    if (!id.trim()) {
      throw new Error("Evidence ID is required.");
    }

    const evidence = await this.repo.getEvidenceById(id);

    if (!evidence) {
      throw new Error("Evidence record not found.");
    }

    return evidence;
  }

  // --------------------------------------------------
  // 5. Retrieve evidence for a project
  // --------------------------------------------------

  async getEvidenceByProject(
    projectId: string
  ): Promise<EvidenceRecord[]> {
    if (!projectId.trim()) {
      throw new Error("Project ID is required.");
    }

    return this.repo.getEvidenceByProject(projectId);
  }

  // --------------------------------------------------
  // 6. Extract invoice metadata and confidence scores
  // --------------------------------------------------

  async extractInvoiceMetadata(
    evidenceId: string
  ): Promise<EvidenceRecord> {
    const evidence = await this.getEvidenceById(evidenceId);

    if (!this.extractionProvider) {
      throw new Error(
        "Invoice extraction provider is not configured."
      );
    }

    if (
      evidence.status === "rejected" ||
      evidence.status === "confirmed"
    ) {
      throw new Error(
        "Invoice extraction is not allowed for this evidence status."
      );
    }

    const processingEvidence: EvidenceRecord = {
      ...evidence,
      status: "processing",
      updatedAt: new Date(),
    };

    await this.repo.updateEvidence(processingEvidence);

    try {
      const extraction =
        await this.extractionProvider.extractInvoice(evidence);

      const parsedMetadata =
        invoiceMetadataSchema.safeParse(extraction.metadata);

      if (!parsedMetadata.success) {
        throw new Error(
          "Invoice extraction returned invalid metadata."
        );
      }

      let confidence: Record<string, number> | undefined;

      if (extraction.confidence !== undefined) {
        const parsedConfidence =
          extractionConfidenceSchema.safeParse(
            extraction.confidence
          );

        if (!parsedConfidence.success) {
          throw new Error(
            "Invoice extraction returned invalid confidence scores."
          );
        }

        confidence = parsedConfidence.data;
      }

      const updated = await this.repo.updateExtractedMetadata(
        evidenceId,
        parsedMetadata.data,
        extraction.provider,
        confidence
      );

      const previousMetadata =
        evidence.confirmedMetadata ?? evidence.extractedMetadata;

      if (
        metadataChanged(
          previousMetadata,
          parsedMetadata.data
        )
      ) {
        await this.invalidateEvidenceReviews(
          evidenceId,
          "Invoice metadata changed after extraction. Previous discrepancy decisions are no longer valid."
        );
      }

      return updated;
    } catch (error) {
      const latest = await this.repo.getEvidenceById(evidenceId);

      if (latest?.status === "processing") {
        await this.repo.updateEvidence({
          ...latest,
          status: "uploaded",
          updatedAt: new Date(),
        });
      }

      throw error;
    }
  }

  // --------------------------------------------------
  // 7. Human confirmation or correction of invoice data
  // --------------------------------------------------

  async confirmInvoiceMetadata(
    evidenceId: string,
    metadata: InvoiceMetadata
  ): Promise<EvidenceRecord> {
    const evidence = await this.getEvidenceById(evidenceId);

    if (
      evidence.status !== "extracted" &&
      evidence.status !== "confirmed"
    ) {
      throw new Error(
        "Evidence must have extracted metadata before confirmation."
      );
    }

    const parsed = invoiceMetadataSchema.safeParse(metadata);

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")
      );
    }

    const previousMetadata =
      evidence.confirmedMetadata ?? evidence.extractedMetadata;

    const changed = metadataChanged(
      previousMetadata,
      parsed.data
    );

    const updated: EvidenceRecord = {
      ...evidence,
      confirmedMetadata: parsed.data,
      status: "confirmed",
      updatedAt: new Date(),
    };

    const saved = await this.repo.updateEvidence(updated);

    if (changed) {
      await this.invalidateEvidenceReviews(
        evidenceId,
        "Confirmed invoice metadata changed. Previous discrepancy decisions are no longer valid."
      );
    }

    return saved;
  }

  // --------------------------------------------------
  // 8. Reject evidence
  // --------------------------------------------------

  async rejectEvidence(
    evidenceId: string
  ): Promise<EvidenceRecord> {
    const evidence = await this.getEvidenceById(evidenceId);

    if (evidence.status === "confirmed") {
      throw new Error(
        "Confirmed evidence cannot be rejected through this operation."
      );
    }

    const updated: EvidenceRecord = {
      ...evidence,
      status: "rejected",
      updatedAt: new Date(),
    };

    const saved = await this.repo.updateEvidence(updated);

    await this.invalidateEvidenceReviews(
      evidenceId,
      "Evidence document was rejected. Its previous discrepancy decisions are no longer active."
    );

    return saved;
  }

  // --------------------------------------------------
  // 9. Create an expense record
  // --------------------------------------------------

  async createExpense(
    input: Omit<
      ExpenseRecord,
      "id" | "createdAt" | "updatedAt"
    >
  ): Promise<ExpenseRecord> {
    const parsed = createExpenseSchema.safeParse(input);

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")
      );
    }

    const now = new Date();

    const expense: ExpenseRecord = {
      id: randomUUID(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };

    return this.repo.createExpense(expense);
  }

  // --------------------------------------------------
  // 10. Retrieve expenses belonging to a project
  // --------------------------------------------------

  async getExpensesByProject(
    projectId: string
  ): Promise<ExpenseRecord[]> {
    if (!projectId.trim()) {
      throw new Error("Project ID is required.");
    }

    return this.repo.getExpensesByProject(projectId);
  }

  // --------------------------------------------------
  // 11. Compare confirmed invoice with an expense
  // --------------------------------------------------

  async compareInvoiceWithExpense(
    evidenceId: string,
    expenseId: string,
    expectedLineItems: Array<{ description: string }> = []
  ): Promise<{
    flags: EvidenceFlag[];
    reviews: VerificationReview[];
  }> {
    const evidence = await this.getEvidenceById(evidenceId);

    const expense = await this.repo.getExpenseById(expenseId);

    if (!expense) {
      throw new Error("Expense record not found.");
    }

    if (evidence.projectId !== expense.projectId) {
      throw new Error(
        "Evidence and expense must belong to the same project."
      );
    }

    if (evidence.expenseId && evidence.expenseId !== expenseId) {
      throw new Error(
        "Evidence is linked to a different expense."
      );
    }

    if (
      evidence.status !== "confirmed" ||
      !evidence.confirmedMetadata
    ) {
      throw new Error(
        "Invoice metadata must be human-confirmed before comparison."
      );
    }

    const metadata = evidence.confirmedMetadata;

    const flags: EvidenceFlag[] = [];
    const reviews: VerificationReview[] = [];

    // Only reviews belonging to this evidence are considered.
    const existingReviews =
      await this.repo.getReviewsByEvidence(evidenceId);

    const addFlag = async (
      flagType: FlagType,
      explanation: string
    ): Promise<void> => {
      const activeAlreadyExists = existingReviews.some(
        (review) =>
          review.flagType === flagType &&
          isActiveReview(review)
      );

      if (activeAlreadyExists) {
        return;
      }

      const now = new Date();

      const flag: EvidenceFlag = {
        id: randomUUID(),
        expenseId: expense.id,
        evidenceId: evidence.id,
        flagType,
        explanation,
        status: "active",
        createdAt: now,
      };

      await this.repo.createEvidenceFlag(flag);
      flags.push(flag);

      const review: VerificationReview = {
        id: randomUUID(),
        expenseId: expense.id,
        evidenceId: evidence.id,
        flagType,
        explanation,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      await this.repo.createVerificationReview(review);
      reviews.push(review);

      existingReviews.push(review);
    };

    // 11.1 Currency and amount comparison

    if (metadata.totalAmountCents !== undefined) {
      if (!metadata.currency || !expense.currency) {
        throw new Error(
          "Invoice and expense currencies are required for amount comparison."
        );
      }

      if (metadata.currency !== expense.currency) {
        throw new Error(
          "Invoice and expense currencies must match before amount comparison."
        );
      }

      if (
        metadata.totalAmountCents !== expense.amountMinor
      ) {
        await addFlag(
          "amount_differs",
          `Invoice amount (${metadata.totalAmountCents} ${metadata.currency}) differs from recorded expense amount (${expense.amountMinor} ${expense.currency}).`
        );
      }
    }

    // 11.2 Vendor mismatch detection

    if (
      metadata.vendorName &&
      metadata.vendorName.trim().toLowerCase() !==
        expense.vendor.trim().toLowerCase()
    ) {
      await addFlag(
        "vendor_mismatch",
        `Invoice vendor (${metadata.vendorName}) differs from recorded vendor (${expense.vendor}).`
      );
    }

    // 11.3 Low-confidence extraction detection

    if (evidence.confidence) {
      const lowConfidenceFields = Object.entries(
        evidence.confidence
      )
        .filter(([, score]) => score < 0.8)
        .map(([field]) => field);

      if (lowConfidenceFields.length > 0) {
        await addFlag(
          "low_confidence",
          `Low extraction confidence for: ${lowConfidenceFields.join(", ")}.`
        );
      }
    }

    // 11.4 Duplicate invoice number detection

    if (metadata.invoiceNumber) {
      const projectEvidence =
        await this.repo.getEvidenceByProject(evidence.projectId);

      const normalizedInvoiceNumber =
        metadata.invoiceNumber.trim().toLowerCase();

      const duplicate = projectEvidence.some((record) => {
        if (record.id === evidence.id) {
          return false;
        }

        const otherInvoiceNumber =
          record.confirmedMetadata?.invoiceNumber ??
          record.extractedMetadata?.invoiceNumber;

        return (
          otherInvoiceNumber?.trim().toLowerCase() ===
          normalizedInvoiceNumber
        );
      });

      if (duplicate) {
        await addFlag(
          "duplicate_invoice",
          `Invoice number ${metadata.invoiceNumber} already exists in another evidence record for this project.`
        );
      }
    }

    // 11.5 Missing expected invoice line detection

    if (expectedLineItems.length > 0) {
      const invoiceLineItems = metadata.lineItems ?? [];

      const normalizedInvoiceDescriptions = new Set(
        invoiceLineItems.map((item) =>
          item.description.trim().toLowerCase()
        )
      );

      const missingItems = expectedLineItems.filter(
        (item) =>
          !normalizedInvoiceDescriptions.has(
            item.description.trim().toLowerCase()
          )
      );

      if (missingItems.length > 0) {
        const missingDescriptions = missingItems
          .map((item) => item.description)
          .join(", ");

        await addFlag(
          "line_missing",
          `Expected budget line items missing from invoice: ${missingDescriptions}.`
        );
      }
    }

    return { flags, reviews };
  }

  // --------------------------------------------------
  // 12. Retrieve unresolved verification review queue
  // --------------------------------------------------

  async getReviewQueue(
    projectId: string
  ): Promise<
    Array<{
      expense: ExpenseRecord;
      reviews: VerificationReview[];
    }>
  > {
    if (!projectId.trim()) {
      throw new Error("Project ID is required.");
    }

    const expenses =
      await this.repo.getExpensesByProject(projectId);

    const queue: Array<{
      expense: ExpenseRecord;
      reviews: VerificationReview[];
    }> = [];

    for (const expense of expenses) {
      const reviews =
        await this.repo.getReviewsByExpense(expense.id);

      const unresolvedReviews = reviews.filter(
        isUnresolvedReview
      );

      if (unresolvedReviews.length > 0) {
        queue.push({
          expense,
          reviews: unresolvedReviews,
        });
      }
    }

    return queue;
  }

  // --------------------------------------------------
  // 13. Resolve a verification review
  // --------------------------------------------------

  async resolveVerificationReview(
    reviewId: string,
    reviewerId: string,
    resolution: ReviewResolution,
    reason?: string
  ): Promise<VerificationReview> {
    if (!reviewId.trim()) {
      throw new Error("Review ID is required.");
    }

    if (!reviewerId.trim()) {
      throw new Error("Reviewer ID is required.");
    }

    const parsedResolution =
      reviewResolutionSchema.safeParse(resolution);

    if (!parsedResolution.success) {
      throw new Error("Invalid review resolution.");
    }

    const existing =
      await this.repo.getVerificationReviewById(reviewId);

    if (!existing) {
      throw new Error("Verification review not found.");
    }

    if (existing.status === "superseded") {
      throw new Error(
        "This review has been superseded and can no longer be resolved."
      );
    }

    if (
      existing.resolution !== undefined &&
      existing.resolution !== "more_info"
    ) {
      throw new Error(
        "This review has already been resolved."
      );
    }

    if (reason !== undefined && !reason.trim()) {
      throw new Error(
        "Review reason cannot be empty."
      );
    }

    const updated: VerificationReview = {
      ...existing,
      reviewerId,
      resolution: parsedResolution.data,
      reason: reason?.trim(),
      updatedAt: new Date(),
    };

    return this.repo.updateVerificationReview(updated);
  }

  // --------------------------------------------------
  // 14. Project evidence coverage report
  // --------------------------------------------------

  async getEvidenceCoverage(projectId: string): Promise<{
    projectId: string;
    totalExpenses: number;
    totalEvidenceDocuments: number;
    confirmedDocuments: number;
    pendingDocuments: number;
    rejectedDocuments: number;
    expensesWithUnresolvedReviews: number;
    expensesWithoutUnresolvedReviews: number;
    unresolvedReviewCount: number;

    // Document confirmation metric:
    // confirmed documents / total documents.
    documentConfirmationRate: number;

    // Expense evidence coverage metric:
    // expenses with confirmed evidence / expenses requiring evidence.
    expenseEvidenceCoverage: number;

    // Backward-compatible alias for document confirmation rate.
    coveragePercentage: number;
  }> {
    if (!projectId.trim()) {
      throw new Error("Project ID is required.");
    }

    const [expenses, evidence] = await Promise.all([
      this.repo.getExpensesByProject(projectId),
      this.repo.getEvidenceByProject(projectId),
    ]);

    let expensesWithUnresolvedReviews = 0;
    let unresolvedReviewCount = 0;

    for (const expense of expenses) {
      const reviews = await this.repo.getReviewsByExpense(expense.id);

      const unresolved = reviews.filter(isUnresolvedReview);

      if (unresolved.length > 0) {
        expensesWithUnresolvedReviews++;
        unresolvedReviewCount += unresolved.length;
      }
    }

    const confirmedDocuments = evidence.filter(
      (item) => item.status === "confirmed"
    ).length;

    const pendingDocuments = evidence.filter(
      (item) =>
        item.status === "uploaded" ||
        item.status === "processing" ||
        item.status === "extracted"
    ).length;

    const rejectedDocuments = evidence.filter(
      (item) => item.status === "rejected"
    ).length;

    const documentConfirmationRate =
      evidence.length === 0
        ? 0
        : Math.round(
            (confirmedDocuments / evidence.length) * 100
          );

    /*
     * The current ExpenseRecord model does not have a
     * requiresEvidence field. Until that field is introduced
     * in the shared contract/schema, this implementation
     * treats every project expense as requiring evidence.
     *
     * An expense is covered when at least one linked evidence
     * document is human-confirmed.
     */
    const expensesWithConfirmedEvidence = expenses.filter(
      (expense) =>
        evidence.some(
          (item) =>
            item.expenseId === expense.id &&
            item.status === "confirmed"
        )
    ).length;

    const expenseEvidenceCoverage =
      expenses.length === 0
        ? 0
        : Math.round(
            (expensesWithConfirmedEvidence / expenses.length) * 100
          );

    return {
      projectId,
      totalExpenses: expenses.length,
      totalEvidenceDocuments: evidence.length,
      confirmedDocuments,
      pendingDocuments,
      rejectedDocuments,
      expensesWithUnresolvedReviews,
      expensesWithoutUnresolvedReviews:
        expenses.length - expensesWithUnresolvedReviews,
      unresolvedReviewCount,
      documentConfirmationRate,
      expenseEvidenceCoverage,
      coveragePercentage: documentConfirmationRate,
    };
  }

  // --------------------------------------------------
  // 15. Gate A evidence readiness assessment
  // --------------------------------------------------

  async assessGateAEvidence(input: {
    projectId: string;
    expenseId: string;
    evidenceId: string;
    reviewerId: string;
    organiserId: string;
  }): Promise<{
    eligible: boolean;
    reasons: string[];
    expenseId: string;
    evidenceId: string;
  }> {
    const {
      projectId,
      expenseId,
      evidenceId,
      reviewerId,
      organiserId,
    } = input;

    if (
      !projectId.trim() ||
      !expenseId.trim() ||
      !evidenceId.trim() ||
      !reviewerId.trim() ||
      !organiserId.trim()
    ) {
      throw new Error(
        "All Gate A evidence assessment inputs are required."
      );
    }

    const reasons: string[] = [];

    const [expense, evidence] = await Promise.all([
      this.repo.getExpenseById(expenseId),
      this.repo.getEvidenceById(evidenceId),
    ]);

    if (!expense) {
      reasons.push("Expense record does not exist.");
    } else if (expense.projectId !== projectId) {
      reasons.push("Expense does not belong to the specified project.");
    }

    if (!evidence) {
      reasons.push("Evidence document does not exist.");
    } else {
      if (evidence.projectId !== projectId) {
        reasons.push("Evidence does not belong to the specified project.");
      }

      if (evidence.expenseId !== expenseId) {
        reasons.push(
          "Evidence is not linked to the specified expense."
        );
      }

      if (evidence.status !== "confirmed") {
        reasons.push("Evidence has not been human-confirmed.");
      }

      if (!evidence.confirmedMetadata) {
        reasons.push(
          "Evidence does not contain human-confirmed invoice metadata."
        );
      }
    }

    if (expense && evidence) {
      // Gate A checks active reviews for the specified expense.
      // Superseded decisions are historical and do not block readiness.
      const expenseReviews =
        await this.repo.getReviewsByExpense(expenseId);

      const activeReviews = expenseReviews.filter(
        isActiveReview
      );

      const unresolvedReviews = activeReviews.filter(
        isUnresolvedReview
      );

      if (unresolvedReviews.length > 0) {
        reasons.push("Expense has unresolved verification reviews.");
      }

      // Approval must be for the current evidence document.
      const approvedReview = activeReviews.some(
        (review) =>
          review.evidenceId === evidenceId &&
          review.resolution === "approved" &&
          review.reviewerId === reviewerId
      );

      if (!approvedReview) {
        reasons.push(
          "Evidence does not have approval from the specified reviewer."
        );
      }

      if (reviewerId === organiserId) {
        reasons.push("Organiser cannot approve their own expense.");
      }
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      expenseId,
      evidenceId,
    };
  }
}
