
import { describe, it, expect, beforeEach } from "vitest";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";

import type {
  CreateEvidenceInput,
  InvoiceMetadata,
  EvidenceRecord,
} from "./types.js";

describe("Evidence Module", () => {
  let service: EvidenceService;
  let repository: InMemoryEvidenceRepository;

  const validEvidence: CreateEvidenceInput = {
    projectId: "project-1",
    milestoneId: "milestone-1",
    uploadedBy: "user-1",
    originalFileName: "invoice.pdf",
    storageKey: "evidence/invoice.pdf",
    mimeType: "application/pdf",
    fileSize: 204800,
  };

  const validExpense = {
    projectId: "project-1",
    budgetId: "budget-1",
    vendor: "Solar Solutions Ltd",
    amountMinor: 1250000,
    currency: "INR",
    date: "2026-11-05",
    reviewStatus: "pending",
  };

  const matchingMetadata: InvoiceMetadata = {
    invoiceNumber: "INV-1001",
    vendorName: "Solar Solutions Ltd",
    invoiceDate: "2026-11-05",
    totalAmountCents: 1250000,
    currency: "INR",
  };

  beforeEach(() => {
    repository = new InMemoryEvidenceRepository();
    service = new EvidenceService(repository);
  });

  // --------------------------------------------------
  // 1. Evidence upload and validation tests
  // --------------------------------------------------

  it("should upload a valid invoice", async () => {
    const evidence = await service.createEvidence(validEvidence);

    expect(evidence.id).toBeDefined();
    expect(evidence.projectId).toBe("project-1");
    expect(evidence.originalFileName).toBe("invoice.pdf");
    expect(evidence.status).toBe("uploaded");
  });

  it("should reject unsupported file types", async () => {
    const invalidEvidence = {
      ...validEvidence,
      mimeType: "text/plain",
    } as unknown as CreateEvidenceInput;

    await expect(
      service.createEvidence(invalidEvidence)
    ).rejects.toThrow();
  });

  it("should reject files exceeding the size limit", async () => {
    const oversizedEvidence: CreateEvidenceInput = {
      ...validEvidence,
      fileSize: 11 * 1024 * 1024,
    };

    await expect(
      service.createEvidence(oversizedEvidence)
    ).rejects.toThrow(/10 MB/i);
  });

  it("should retrieve uploaded evidence", async () => {
    const created = await service.createEvidence(validEvidence);

    const retrieved = await service.getEvidenceById(created.id);

    expect(retrieved.id).toBe(created.id);
    expect(retrieved.projectId).toBe("project-1");
    expect(retrieved.status).toBe("uploaded");
  });

  it("should handle missing evidence records", async () => {
    await expect(
      service.getEvidenceById("non-existent-id")
    ).rejects.toThrow("Evidence record not found.");
  });

  it("should validate evidence metadata", async () => {
    const created = await service.createEvidence(validEvidence);

    await expect(
      service.confirmInvoiceMetadata(created.id, {
        invoiceDate: "invalid-date",
        totalAmountCents: -100,
      })
    ).rejects.toThrow();
  });

  // --------------------------------------------------
  // 2. Invoice extraction and confidence tests
  // --------------------------------------------------

  it("should persist invoice extraction confidence scores", async () => {
    const extractionProvider = {
      extractInvoice: async () => ({
        metadata: {
          vendorName: "Solar Solutions Ltd",
          invoiceDate: "2026-11-05",
          totalAmountCents: 1250000,
        },
        provider: "test-provider",
        confidence: {
          vendorName: 0.98,
          invoiceDate: 0.95,
          totalAmountCents: 0.87,
        },
      }),
    };

    const extractionService = new EvidenceService(
      repository,
      extractionProvider
    );

    const created =
      await extractionService.createEvidence(validEvidence);

    const extracted =
      await extractionService.extractInvoiceMetadata(created.id);

    expect(extracted.status).toBe("extracted");

    expect(extracted.confidence).toEqual({
      vendorName: 0.98,
      invoiceDate: 0.95,
      totalAmountCents: 0.87,
    });

    const retrieved =
      await extractionService.getEvidenceById(created.id);

    expect(retrieved.confidence).toEqual(extracted.confidence);
  });

  // --------------------------------------------------
  // 3. Expense creation and retrieval tests
  // --------------------------------------------------

  it("should create an expense with valid details", async () => {
    const expense = await service.createExpense(validExpense);

    expect(expense.id).toBeDefined();
    expect(expense.projectId).toBe("project-1");
    expect(expense.budgetId).toBe("budget-1");
    expect(expense.vendor).toBe("Solar Solutions Ltd");
    expect(expense.amountMinor).toBe(1250000);
    expect(expense.reviewStatus).toBe("pending");
  });

  it("should reject an expense with an invalid amount", async () => {
    await expect(
      service.createExpense({
        ...validExpense,
        amountMinor: -100,
      })
    ).rejects.toThrow();
  });

  it("should retrieve expenses belonging to a project", async () => {
    await service.createExpense(validExpense);

    await service.createExpense({
      ...validExpense,
      projectId: "project-2",
      budgetId: "budget-2",
      vendor: "Other Vendor",
      amountMinor: 500000,
    });

    const expenses =
      await service.getExpensesByProject("project-1");

    expect(expenses).toHaveLength(1);
    expect(expenses[0].projectId).toBe("project-1");
    expect(expenses[0].vendor).toBe("Solar Solutions Ltd");
  });

  // --------------------------------------------------
  // 4. Helper for invoice comparison tests
  // --------------------------------------------------

  async function prepareComparison(
    metadataOverrides: Partial<InvoiceMetadata> = {},
    confidence: Record<string, number> = {
      vendorName: 0.98,
      invoiceDate: 0.95,
      totalAmountCents: 0.92,
    }
  ) {
    const extractionProvider = {
      extractInvoice: async () => ({
        metadata: {
          ...matchingMetadata,
          ...metadataOverrides,
        },
        provider: "test-provider",
        confidence,
      }),
    };

    const comparisonService = new EvidenceService(
      repository,
      extractionProvider
    );

    const evidence =
      await comparisonService.createEvidence(validEvidence);

    await comparisonService.extractInvoiceMetadata(evidence.id);

    const confirmedEvidence =
      await comparisonService.confirmInvoiceMetadata(
        evidence.id,
        {
          ...matchingMetadata,
          ...metadataOverrides,
        }
      );

    const expense =
      await comparisonService.createExpense(validExpense);

    return {
      comparisonService,
      evidence: confirmedEvidence,
      expense,
      repository,
    };
  }

  // --------------------------------------------------
  // 5. Invoice and expense comparison tests
  // --------------------------------------------------

  it("should flag an amount difference between invoice and expense", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const result =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].flagType).toBe("amount_differs");
    expect(result.flags[0].evidenceId).toBe(evidence.id);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].resolution).toBeUndefined();
    expect(result.reviews[0].evidenceId).toBe(evidence.id);
  });

  it("should flag a vendor mismatch", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      vendorName: "Different Solar Vendor",
    });

    const result =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(
      result.flags.some(
        (flag) => flag.flagType === "vendor_mismatch"
      )
    ).toBe(true);
  });

  it("should flag low-confidence invoice extraction fields", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison(
      {},
      {
        vendorName: 0.98,
        invoiceDate: 0.95,
        totalAmountCents: 0.65,
      }
    );

    const result =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(
      result.flags.some(
        (flag) => flag.flagType === "low_confidence"
      )
    ).toBe(true);

    expect(
      result.flags.find(
        (flag) => flag.flagType === "low_confidence"
      )?.explanation
    ).toContain("totalAmountCents");
  });

  it("should detect duplicate invoice numbers within a project", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison();

    const duplicateEvidence =
      await comparisonService.createEvidence({
        ...validEvidence,
        originalFileName: "duplicate-invoice.pdf",
        storageKey: "evidence/duplicate-invoice.pdf",
      });

    await comparisonService.extractInvoiceMetadata(
      duplicateEvidence.id
    );

    const result =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(
      result.flags.some(
        (flag) => flag.flagType === "duplicate_invoice"
      )
    ).toBe(true);
  });

  // --------------------------------------------------
  // 6. Invoice comparison validation tests
  // --------------------------------------------------

  it("should reject comparison when invoice metadata is not confirmed", async () => {
    const comparisonService = new EvidenceService(repository);

    const evidence =
      await comparisonService.createEvidence(validEvidence);

    const expense =
      await comparisonService.createExpense(validExpense);

    await expect(
      comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      )
    ).rejects.toThrow(
      "Invoice metadata must be human-confirmed before comparison."
    );
  });

  it("should reject comparison between different projects", async () => {
    const {
      comparisonService,
      evidence,
    } = await prepareComparison();

    const otherExpense =
      await comparisonService.createExpense({
        ...validExpense,
        projectId: "project-2",
        budgetId: "budget-2",
      });

    await expect(
      comparisonService.compareInvoiceWithExpense(
        evidence.id,
        otherExpense.id
      )
    ).rejects.toThrow(
      "Evidence and expense must belong to the same project."
    );
  });

  // --------------------------------------------------
  // 7. Verification review queue tests
  // --------------------------------------------------

  it("should add unresolved reviews to the review queue and remove resolved reviews", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(comparison.reviews).toHaveLength(1);

    const reviewId = comparison.reviews[0].id;

    const initialQueue =
      await comparisonService.getReviewQueue("project-1");

    expect(initialQueue).toHaveLength(1);
    expect(initialQueue[0].reviews).toHaveLength(1);

    await comparisonService.resolveVerificationReview(
      reviewId,
      "reviewer-1",
      "explained",
      "The difference was verified against the supporting documents."
    );

    const updatedQueue =
      await comparisonService.getReviewQueue("project-1");

    expect(updatedQueue).toHaveLength(0);
  });

  it("should keep a review in the queue when more information is requested", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    const reviewId = comparison.reviews[0].id;

    await comparisonService.resolveVerificationReview(
      reviewId,
      "reviewer-1",
      "more_info",
      "Please provide the missing supporting document."
    );

    const queue =
      await comparisonService.getReviewQueue("project-1");

    expect(queue).toHaveLength(1);
    expect(queue[0].reviews[0].resolution).toBe("more_info");
  });

  it("should reject resolution of a non-existent review", async () => {
    await expect(
      service.resolveVerificationReview(
        "unknown-review",
        "reviewer-1",
        "approved"
      )
    ).rejects.toThrow("Verification review not found.");
  });

  // --------------------------------------------------
  // 8. Metadata-change invalidation tests
  // --------------------------------------------------

  it("should supersede previous flags and reviews when confirmed metadata changes", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    expect(comparison.reviews).toHaveLength(1);

    const review = comparison.reviews[0];

    await comparisonService.resolveVerificationReview(
      review.id,
      "reviewer-1",
      "approved",
      "Previously approved invoice."
    );

    const updatedMetadata: InvoiceMetadata = {
      ...matchingMetadata,
      totalAmountCents: 1250000,
    };

    await comparisonService.confirmInvoiceMetadata(
      evidence.id,
      updatedMetadata
    );

    const storedReview =
      await repository.getVerificationReviewById(review.id);

    expect(storedReview?.status).toBe("superseded");
    expect(storedReview?.resolution).toBe("approved");
    expect(storedReview?.supersededReason).toContain(
      "Confirmed invoice metadata changed"
    );

    const flags =
      await repository.getFlagsByEvidence(evidence.id);

    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe("superseded");
  });

  it("should preserve previous review decisions in audit history after metadata changes", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    const review = comparison.reviews[0];

    await comparisonService.resolveVerificationReview(
      review.id,
      "reviewer-1",
      "approved",
      "Invoice amount checked."
    );

    await comparisonService.confirmInvoiceMetadata(
      evidence.id,
      {
        ...matchingMetadata,
        totalAmountCents: 1250000,
      }
    );

    const history =
      await repository.getReviewAuditHistory(review.id);

    expect(history.length).toBeGreaterThanOrEqual(3);

    expect(
      history.some(
        (event) =>
          event.action === "updated" &&
          event.newResolution === "approved"
      )
    ).toBe(true);

    expect(
      history.some(
        (event) => event.action === "superseded"
      )
    ).toBe(true);
  });

  it("should not invalidate existing reviews when confirmed metadata remains unchanged", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    const review = comparison.reviews[0];

    await comparisonService.confirmInvoiceMetadata(
      evidence.id,
      {
        ...matchingMetadata,
        totalAmountCents: 1500000,
      }
    );

    const storedReview =
      await repository.getVerificationReviewById(review.id);

    expect(storedReview?.status).toBe("active");
  });

  it("should not allow a superseded review to be resolved again", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      totalAmountCents: 1500000,
    });

    const comparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    const review = comparison.reviews[0];

    await comparisonService.confirmInvoiceMetadata(
      evidence.id,
      {
        ...matchingMetadata,
        totalAmountCents: 1250000,
      }
    );

    await expect(
      comparisonService.resolveVerificationReview(
        review.id,
        "reviewer-1",
        "approved"
      )
    ).rejects.toThrow(
      "This review has been superseded and can no longer be resolved."
    );
  });

  // --------------------------------------------------
  // 9. Evidence-specific review and duplicate prevention
  // --------------------------------------------------

  it("should not create duplicate active reviews when the same evidence is compared twice", async () => {
      const {
        comparisonService,
        evidence,
        expense,
      } = await prepareComparison({
        totalAmountCents: 1500000,
      });

      const first =
        await comparisonService.compareInvoiceWithExpense(
          evidence.id,
          expense.id
        );

      const second =
        await comparisonService.compareInvoiceWithExpense(
          evidence.id,
          expense.id
        );

      expect(first.reviews).toHaveLength(1);
      expect(second.reviews).toHaveLength(0);

      const storedReviews =
        await repository.getReviewsByEvidence(evidence.id);

      expect(storedReviews).toHaveLength(1);
    });

  it("should keep reviews for different evidence documents independent", async () => {
    const {
      comparisonService,
      evidence,
      expense,
    } = await prepareComparison({
      vendorName: "Different Solar Vendor",
    });

    const firstComparison =
      await comparisonService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    const secondEvidence =
      await comparisonService.createEvidence({
        ...validEvidence,
        originalFileName: "second-invoice.pdf",
        storageKey: "evidence/second-invoice.pdf",
      });

    await comparisonService.extractInvoiceMetadata(secondEvidence.id);

    await comparisonService.confirmInvoiceMetadata(
      secondEvidence.id,
      {
        ...matchingMetadata,
        invoiceNumber: "INV-1002",
        vendorName: "Another Different Vendor",
      }
    );

    const secondComparison =
      await comparisonService.compareInvoiceWithExpense(
        secondEvidence.id,
        expense.id
      );

    // Each evidence document must have its own review.
    expect(firstComparison.reviews).toHaveLength(1);
    expect(secondComparison.reviews).toHaveLength(1);

    expect(firstComparison.reviews[0].evidenceId).toBe(
      evidence.id
    );

    expect(secondComparison.reviews[0].evidenceId).toBe(
      secondEvidence.id
    );

    // Updating the first evidence must not invalidate
    // reviews belonging to the second evidence.
    await comparisonService.confirmInvoiceMetadata(
      evidence.id,
      {
        ...matchingMetadata,
        vendorName: "Solar Solutions Ltd",
      }
    );

    const firstReviews =
      await repository.getReviewsByEvidence(evidence.id);

    const secondReviews =
      await repository.getReviewsByEvidence(secondEvidence.id);

    expect(firstReviews[0].status).toBe("superseded");
    expect(secondReviews[0].status).toBe("active");
  });


  // --------------------------------------------------
  // 10. Gate A evidence readiness tests
  // --------------------------------------------------

  async function prepareGateA() {
    const expense =
      await service.createExpense(validExpense);

    const linkedEvidenceInput: CreateEvidenceInput = {
      ...validEvidence,
      expenseId: expense.id,
    };

    const extractionProvider = {
      extractInvoice: async () => ({
        metadata: {
          ...matchingMetadata,
          totalAmountCents: 1500000,
        },
        provider: "test-provider",
        confidence: {
          vendorName: 0.98,
          totalAmountCents: 0.95,
        },
      }),
    };

    const gateService = new EvidenceService(
      repository,
      extractionProvider
    );

    const evidence =
      await gateService.createEvidence(linkedEvidenceInput);

    await gateService.extractInvoiceMetadata(evidence.id);

    await gateService.confirmInvoiceMetadata(
      evidence.id,
      {
        ...matchingMetadata,
        totalAmountCents: 1500000,
      }
    );

    const comparison =
      await gateService.compareInvoiceWithExpense(
        evidence.id,
        expense.id
      );

    return {
      gateService,
      evidence,
      expense,
      review: comparison.reviews[0],
    };
  }

  it("should allow Gate A when the current evidence has reviewer approval and no unresolved reviews", async () => {
    const {
      gateService,
      evidence,
      expense,
      review,
    } = await prepareGateA();

    await gateService.resolveVerificationReview(
      review.id,
      "reviewer-1",
      "approved",
      "Evidence verified."
    );

    const result = await gateService.assessGateAEvidence({
      projectId: "project-1",
      expenseId: expense.id,
      evidenceId: evidence.id,
      reviewerId: "reviewer-1",
      organiserId: "organiser-1",
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("should reject Gate A when the organiser is also the reviewer", async () => {
    const {
      gateService,
      evidence,
      expense,
      review,
    } = await prepareGateA();

    await gateService.resolveVerificationReview(
      review.id,
      "organiser-1",
      "approved",
      "Review completed."
    );

    const result = await gateService.assessGateAEvidence({
      projectId: "project-1",
      expenseId: expense.id,
      evidenceId: evidence.id,
      reviewerId: "organiser-1",
      organiserId: "organiser-1",
    });

    expect(result.eligible).toBe(false);

    expect(result.reasons).toContain(
      "Organiser cannot approve their own expense."
    );
  });

  it("should reject Gate A when the approval belongs to another evidence document", async () => {
    const {
      gateService,
      evidence,
      expense,
      review,
    } = await prepareGateA();

    await gateService.resolveVerificationReview(
      review.id,
      "reviewer-1",
      "approved",
      "Evidence verified."
    );

    const anotherEvidence: EvidenceRecord = {
      ...evidence,
      id: "another-evidence",
      originalFileName: "another-invoice.pdf",
      storageKey: "evidence/another-invoice.pdf",
    };

    await repository.createEvidence(anotherEvidence);

    const result = await gateService.assessGateAEvidence({
      projectId: "project-1",
      expenseId: expense.id,
      evidenceId: anotherEvidence.id,
      reviewerId: "reviewer-1",
      organiserId: "organiser-1",
    });

    expect(result.eligible).toBe(false);

    expect(result.reasons).toContain(
      "Evidence does not have approval from the specified reviewer."
    );
  });
});
