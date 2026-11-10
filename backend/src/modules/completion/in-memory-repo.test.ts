import { describe, expect, it } from "vitest";

import { InMemoryCompletionRepository } from "./in-memory-repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  Attestation,
} from "./types.js";

// --------------------------------------------------
// Test data helpers
// --------------------------------------------------

function createSpec(
  overrides: Partial<CompletionSpec> = {}
): CompletionSpec {
  const now = new Date();

  return {
    id: "spec-1",
    milestoneId: "milestone-1",
    spec: {
      description: "Install and verify solar panels",
    },
    minAttestations: 5,
    windowDays: 7,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createProof(
  overrides: Partial<ProofSubmission> = {}
): ProofSubmission {
  return {
    id: "proof-1",
    specId: "spec-1",
    fileRefs: ["proof-image-1.png"],
    checklist: {
      installationComplete: true,
      testingComplete: true,
    },
    submittedAt: new Date(),
    ...overrides,
  };
}

function createAttestation(
  overrides: Partial<Attestation> = {}
): Attestation {
  return {
    id: "attestation-1",
    specId: "spec-1",
    householdId: "household-1",
    tokenHash: "hashed-token-1",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

// --------------------------------------------------
// Repository tests
// --------------------------------------------------

describe("InMemoryCompletionRepository", () => {
  // ------------------------------------------------
  // Completion specifications
  // ------------------------------------------------

  describe("Completion specifications", () => {
    it("creates and retrieves a completion specification", async () => {
      const repo = new InMemoryCompletionRepository();
      const spec = createSpec();

      const created = await repo.createSpec(spec);

      expect(created).toEqual(spec);
      expect(await repo.getSpecById(spec.id)).toEqual(spec);
      expect(
        await repo.getSpecByMilestone(spec.milestoneId)
      ).toEqual(spec);
    });

    it("rejects duplicate specification IDs", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      await expect(
        repo.createSpec(createSpec())
      ).rejects.toThrow(
        "Completion specification ID already exists."
      );
    });

    it("rejects multiple specifications for the same milestone", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      await expect(
        repo.createSpec(
          createSpec({
            id: "spec-2",
          })
        )
      ).rejects.toThrow(
        "A completion specification already exists for this milestone."
      );
    });
  });

  // ------------------------------------------------
  // Proof submissions
  // ------------------------------------------------

  describe("Proof submissions", () => {
    it("creates and retrieves a proof submission", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const proof = createProof();
      const created = await repo.createProof(proof);

      expect(created).toEqual(proof);
      expect(await repo.getProofById(proof.id)).toEqual(proof);
      expect(
        await repo.getProofBySpecId(proof.specId)
      ).toEqual(proof);
    });

    it("rejects proof for a nonexistent specification", async () => {
      const repo = new InMemoryCompletionRepository();

      await expect(
        repo.createProof(createProof())
      ).rejects.toThrow(
        "Cannot submit proof for a nonexistent completion specification."
      );
    });

    it("rejects duplicate proof IDs", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());
      await repo.createProof(createProof());

      await expect(
        repo.createProof(createProof())
      ).rejects.toThrow(
        "Proof submission ID already exists."
      );
    });

    it("preserves multiple proof submissions for the same specification and returns the latest", async () => {
      const repo = new InMemoryCompletionRepository();
      await repo.createSpec(createSpec());

      const first = createProof({
        id: "proof-1",
        submittedAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      const second = createProof({
        id: "proof-2",
        fileRefs: ["proof-image-2.png"],
        submittedAt: new Date("2026-01-02T10:00:00.000Z"),
      });

      await repo.createProof(first);
      await repo.createProof(second);

      expect(await repo.getProofById(first.id)).toEqual(first);
      expect(await repo.getProofById(second.id)).toEqual(second);
      expect(await repo.getProofBySpecId(first.specId)).toEqual(second);
    });
  });

  // ------------------------------------------------
  // Attestations
  // ------------------------------------------------

  describe("Attestations", () => {
    it("creates and retrieves an attestation", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const attestation = createAttestation();

      const created = await repo.createAttestation(attestation);

      expect(created).toEqual(attestation);

      expect(
        await repo.getAttestationByTokenHash(
          attestation.tokenHash
        )
      ).toEqual(attestation);

      expect(
        await repo.getAttestationByHousehold(
          attestation.specId,
          attestation.householdId
        )
      ).toEqual(attestation);

      expect(
        await repo.getAttestationsBySpec(attestation.specId)
      ).toEqual([attestation]);
    });

    it("rejects attestation for a nonexistent specification", async () => {
      const repo = new InMemoryCompletionRepository();

      await expect(
        repo.createAttestation(createAttestation())
      ).rejects.toThrow(
        "Cannot create attestation for a nonexistent completion specification."
      );
    });

    it("rejects duplicate household invitations", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());
      await repo.createAttestation(createAttestation());

      await expect(
        repo.createAttestation(
          createAttestation({
            id: "attestation-2",
            tokenHash: "hashed-token-2",
          })
        )
      ).rejects.toThrow(
        "Household has already been invited."
      );
    });

    it("rejects duplicate token hashes", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      await repo.createAttestation(createAttestation());

      await expect(
        repo.createAttestation(
          createAttestation({
            id: "attestation-2",
            householdId: "household-2",
          })
        )
      ).rejects.toThrow(
        "Attestation token already exists."
      );
    });

    it("rejects duplicate attestation IDs", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());
      await repo.createAttestation(createAttestation());

      await expect(
        repo.createAttestation(createAttestation())
      ).rejects.toThrow(
        "Attestation ID already exists."
      );
    });

    it("rejects empty household IDs", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      await expect(
        repo.createAttestation(
          createAttestation({
            householdId: "   ",
          })
        )
      ).rejects.toThrow("Household ID is required.");
    });

    it("rejects empty token hashes", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      await expect(
        repo.createAttestation(
          createAttestation({
            tokenHash: "   ",
          })
        )
      ).rejects.toThrow(
        "Attestation token hash is required."
      );
    });
  });

  // ------------------------------------------------
  // Attestation updates
  // ------------------------------------------------

  describe("Attestation updates", () => {
    it("allows a valid first attestation response", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      const updated = {
        ...original,
        response: "works" as const,
        usedAt: new Date(),
      };

      const result = await repo.updateAttestation(updated);

      expect(result.response).toBe("works");
      expect(result.usedAt).toBeInstanceOf(Date);
    });

    it("rejects reuse of an already-used attestation", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      const used = {
        ...original,
        response: "works" as const,
        usedAt: new Date(),
      };

      await repo.updateAttestation(used);

      await expect(
        repo.updateAttestation({
          ...used,
          response: "not_working",
          usedAt: new Date(),
        })
      ).rejects.toThrow(
        "Attestation link has already been used."
      );
    });

    it("rejects changing attestation identity", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      await expect(
        repo.updateAttestation({
          ...original,
          householdId: "another-household",
        })
      ).rejects.toThrow(
        "Attestation identity and token cannot be changed."
      );
    });

    it("rejects changing the token hash", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      await expect(
        repo.updateAttestation({
          ...original,
          tokenHash: "different-token-hash",
        })
      ).rejects.toThrow(
        "Attestation identity and token cannot be changed."
      );
    });

    it("rejects changing expiration date", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      await expect(
        repo.updateAttestation({
          ...original,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow(
        "Attestation expiration cannot be changed."
      );
    });

    it("rejects a response without a usage timestamp", async () => {
      const repo = new InMemoryCompletionRepository();

      await repo.createSpec(createSpec());

      const original = createAttestation();
      await repo.createAttestation(original);

      await expect(
        repo.updateAttestation({
          ...original,
          response: "works",
        })
      ).rejects.toThrow(
        "Attestation response must include a usage timestamp."
      );
    });

    it("rejects updating a nonexistent attestation", async () => {
      const repo = new InMemoryCompletionRepository();

      await expect(
        repo.updateAttestation(createAttestation())
      ).rejects.toThrow("Attestation not found.");
    });
  });
});
