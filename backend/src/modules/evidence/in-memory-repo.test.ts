
import { describe, expect, it } from "vitest";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";

import type {
  EvidenceRecord,
  EvidenceFlag,
  VerificationReview,
} from "./types.js";

function createEvidence(
  overrides: Partial<EvidenceRecord> = {}
): EvidenceRecord {
  const now = new Date();

  return {
    id: "evidence-1",
    projectId: "project-1",
    milestoneId: "milestone-1",
    uploadedBy: "organiser-1",
    originalFileName: "invoice.pdf",
    storageKey: "invoice.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    status: "uploaded",
    uploadedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createFlag(
  overrides: Partial<EvidenceFlag> = {}
): EvidenceFlag {
  return {
    id: "flag-1",
    expenseId: "expense-1",
    evidenceId: "evidence-1",
    flagType: "amount_differs",
    explanation: "Invoice amount differs from expense.",
    status: "active",
    createdAt: new Date(),
    ...overrides,
  };
}

function createReview(
  overrides: Partial<VerificationReview> = {}
): VerificationReview {
  const now = new Date();

  return {
    id: "review-1",
    expenseId: "expense-1",
    evidenceId: "evidence-1",
    flagType: "amount_differs",
    explanation: "Invoice amount differs from expense.",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("InMemoryEvidenceRepository integrity", () => {
  it("rejects duplicate evidence IDs", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidence(createEvidence());

    await expect(
      repo.createEvidence(createEvidence())
    ).rejects.toThrow("Evidence record already exists.");
  });

  it("rejects changes to immutable evidence fields", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidence(createEvidence());

    const updated = createEvidence({
      uploadedBy: "another-user",
    });

    await expect(
      repo.updateEvidence(updated)
    ).rejects.toThrow("Immutable evidence fields cannot be changed.");
  });

  it("allows valid evidence status updates", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidence(createEvidence());

    const updated = createEvidence({
      status: "confirmed",
      confirmedMetadata: {
        vendorName: "Solar Vendor",
        totalAmountCents: 50000,
        currency: "INR",
      },
    });

    const result = await repo.updateEvidence(updated);

    expect(result.status).toBe("confirmed");
    expect(result.confirmedMetadata?.vendorName).toBe("Solar Vendor");
  });

  it("rejects updates for nonexistent evidence", async () => {
    const repo = new InMemoryEvidenceRepository();

    await expect(
      repo.updateEvidence(createEvidence())
    ).rejects.toThrow("Evidence record not found.");
  });

  it("retrieves flags belonging to a specific evidence document", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidenceFlag(createFlag());

    await repo.createEvidenceFlag(
      createFlag({
        id: "flag-2",
        evidenceId: "evidence-2",
      })
    );

    const flags = await repo.getFlagsByEvidence("evidence-1");

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("flag-1");
  });

  it("rejects duplicate active flags for the same evidence and flag type", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidenceFlag(createFlag());

    await expect(
      repo.createEvidenceFlag(
        createFlag({
          id: "flag-duplicate",
        })
      )
    ).rejects.toThrow(
      "An active flag of this type already exists for this evidence."
    );
  });

  it("allows the same flag type for different evidence documents", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidenceFlag(createFlag());

    const secondFlag = await repo.createEvidenceFlag(
      createFlag({
        id: "flag-2",
        evidenceId: "evidence-2",
      })
    );

    expect(secondFlag.evidenceId).toBe("evidence-2");
  });

  it("supersedes active flags without deleting their history", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidenceFlag(createFlag());

    const superseded =
      await repo.supersedeActiveFlagsByEvidence(
        "evidence-1",
        "Invoice metadata changed."
      );

    expect(superseded).toHaveLength(1);
    expect(superseded[0].status).toBe("superseded");
    expect(superseded[0].supersededReason).toBe(
      "Invoice metadata changed."
    );

    const allFlags = await repo.getFlagsByExpense("expense-1");

    expect(allFlags).toHaveLength(1);
    expect(allFlags[0].status).toBe("superseded");
  });

  it("does not supersede flags belonging to another evidence document", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createEvidenceFlag(createFlag());

    await repo.createEvidenceFlag(
      createFlag({
        id: "flag-2",
        evidenceId: "evidence-2",
      })
    );

    await repo.supersedeActiveFlagsByEvidence(
      "evidence-1",
      "Metadata changed."
    );

    const otherEvidenceFlags =
      await repo.getFlagsByEvidence("evidence-2");

    expect(otherEvidenceFlags).toHaveLength(1);
    expect(otherEvidenceFlags[0].status).toBe("active");
  });

  it("creates a verification review and its audit event", async () => {
    const repo = new InMemoryEvidenceRepository();

    const review = await repo.createVerificationReview(
      createReview()
    );

    expect(review.id).toBe("review-1");

    const history = await repo.getReviewAuditHistory("review-1");

    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("created");
  });

  it("preserves review audit history when a review is updated", async () => {
    const repo = new InMemoryEvidenceRepository();

    const review = await repo.createVerificationReview(
      createReview()
    );

    await repo.updateVerificationReview({
      ...review,
      reviewerId: "reviewer-1",
      resolution: "approved",
      reason: "Invoice verified.",
      updatedAt: new Date(),
    });

    const history = await repo.getReviewAuditHistory(review.id);

    expect(history).toHaveLength(2);
    expect(history[0].action).toBe("created");
    expect(history[1].action).toBe("updated");
    expect(history[1].previousResolution).toBeUndefined();
    expect(history[1].newResolution).toBe("approved");
  });

  it("supersedes reviews and preserves their audit history", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createVerificationReview(createReview());

    const superseded =
      await repo.supersedeReviewsByEvidence(
        "evidence-1",
        "Confirmed invoice metadata changed."
      );

    expect(superseded).toHaveLength(1);
    expect(superseded[0].status).toBe("superseded");

    const stored = await repo.getVerificationReviewById("review-1");

    expect(stored?.status).toBe("superseded");
    expect(stored?.supersededReason).toBe(
      "Confirmed invoice metadata changed."
    );

    const history = await repo.getReviewAuditHistory("review-1");

    expect(history).toHaveLength(2);
    expect(history[1].action).toBe("superseded");
  });

  it("does not supersede reviews belonging to another evidence document", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createVerificationReview(createReview());

    await repo.createVerificationReview(
      createReview({
        id: "review-2",
        evidenceId: "evidence-2",
      })
    );

    await repo.supersedeReviewsByEvidence(
      "evidence-1",
      "Metadata changed."
    );

    const otherReviews =
      await repo.getReviewsByEvidence("evidence-2");

    expect(otherReviews).toHaveLength(1);
    expect(otherReviews[0].status).toBe("active");
  });

  it("retrieves audit history by evidence ID", async () => {
    const repo = new InMemoryEvidenceRepository();

    await repo.createVerificationReview(createReview());

    const history =
      await repo.getReviewAuditHistoryByEvidence("evidence-1");

    expect(history).toHaveLength(1);
    expect(history[0].evidenceId).toBe("evidence-1");
  });

  it("rejects updates for nonexistent verification reviews", async () => {
    const repo = new InMemoryEvidenceRepository();

    await expect(
      repo.updateVerificationReview(createReview())
    ).rejects.toThrow("Verification review not found.");
  });
});
