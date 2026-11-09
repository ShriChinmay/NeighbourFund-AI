import { describe, it, expect, beforeEach } from "vitest";

import { EvidenceService } from "./service.js";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";

import type {
  CreateEvidenceInput,
  InvoiceMetadata,
} from "./types.js";

describe("Evidence Module", () => {
  let service: EvidenceService;

  const validEvidence: CreateEvidenceInput = {
    projectId: "project-1",
    milestoneId: "milestone-1",
    uploadedBy: "user-1",
    originalFileName: "invoice.pdf",
    storageKey: "evidence/invoice.pdf",
    mimeType: "application/pdf",
    fileSize: 204800,
  };

  beforeEach(() => {
    const repository = new InMemoryEvidenceRepository();
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
    const repository = new InMemoryEvidenceRepository();

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
    const expense = await service.createExpense({
      projectId: "project-1",
      budgetId: "budget-1",
      vendor: "Solar Solutions Ltd",
      amountMinor: 1250000,
      date: "2026-11-05",
      reviewStatus: "pending",
    });

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
        projectId: "project-1",
        budgetId: "budget-1",
        vendor: "Solar Solutions Ltd",
        amountMinor: -100,
        date: "2026-11-05",
        reviewStatus: "pending",
      })
    ).rejects.toThrow();
  });

  it("should retrieve expenses belonging to a project", async () => {
    await service.createExpense({
      projectId: "project-1",
      budgetId: "budget-1",
      vendor: "Solar Solutions Ltd",
      amountMinor: 1250000,
      date: "2026-11-05",
      reviewStatus: "pending",
    });

    await service.createExpense({
      projectId: "project-2",
      budgetId: "budget-2",
      vendor: "Other Vendor",
      amountMinor: 500000,
      date: "2026-11-06",
      reviewStatus: "pending",
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
    const repository = new InMemoryEvidenceRepository();

    const extractionProvider = {
      extractInvoice: async () => ({
        metadata: {
          invoiceNumber: "INV-1001",
          vendorName: "Solar Solutions Ltd",
          invoiceDate: "2026-11-05",
          totalAmountCents: 1250000,
          currency: "INR",
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
          invoiceNumber: "INV-1001",
          vendorName: "Solar Solutions Ltd",
          invoiceDate: "2026-11-05",
          totalAmountCents: 1250000,
          currency: "INR",
          ...metadataOverrides,
        }
      );

    const expense = await comparisonService.createExpense({
      projectId: "project-1",
      budgetId: "budget-1",
      vendor: "Solar Solutions Ltd",
      amountMinor: 1250000,
      currency: "INR",
      date: "2026-11-05",
      reviewStatus: "pending",
    });

    return {
      comparisonService,
      evidence: confirmedEvidence,
      expense,
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
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].resolution).toBeUndefined();
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
    const repository = new InMemoryEvidenceRepository();

    const comparisonService = new EvidenceService(repository);

    const evidence =
      await comparisonService.createEvidence(validEvidence);

    const expense = await comparisonService.createExpense({
      projectId: "project-1",
      budgetId: "budget-1",
      vendor: "Solar Solutions Ltd",
      amountMinor: 1250000,
      date: "2026-11-05",
      reviewStatus: "pending",
    });

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
        projectId: "project-2",
        budgetId: "budget-2",
        vendor: "Solar Solutions Ltd",
        amountMinor: 1250000,
        currency: "INR",
        date: "2026-11-05",
        reviewStatus: "pending",
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
});
