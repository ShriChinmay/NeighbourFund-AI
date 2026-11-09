import { describe, expect, it } from "vitest";
import { InMemoryEvidenceRepository } from "./in-memory-repo.js";
import type { EvidenceRecord } from "./types.js";

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
});
