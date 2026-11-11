import { randomUUID } from "node:crypto";

import type { CompletionRepository } from "./repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
  CreateCompletionSpecInput,
  CreateProofSubmissionInput,
  CreateProofReviewInput,
  AttestationLink,
  AttestationResponse,
} from "./types.js";

import {
  generateToken,
  hashToken,
  verifyToken,
  isTokenExpired,
} from "./attestation-token.js";

/**
 * P2 integration boundary.
 *
 * P4 only consumes the result of this interface.
 * The actual payment/release implementation belongs to P2.
 */
export interface GateBPrerequisiteProvider {
  isTrancheAPaidOrSubmitted(
    milestoneId: string
  ): Promise<boolean>;
}

/**
 * Safe default: Gate B remains blocked until a trusted
 * Tranche A status provider is configured.
 */
const defaultGateBPrerequisiteProvider: GateBPrerequisiteProvider = {
  async isTrancheAPaidOrSubmitted() {
    return false;
  },
};

export class CompletionService {
  constructor(
    private readonly repo: CompletionRepository,
    private readonly hmacSecret: string,
    private readonly gateBPrerequisiteProvider:
      GateBPrerequisiteProvider = defaultGateBPrerequisiteProvider
  ) {
    if (
      !hmacSecret ||
      Buffer.byteLength(hmacSecret) < 32
    ) {
      throw new Error(
        "Attestation HMAC secret must be at least 32 bytes."
      );
    }
  }

  // Resolve either a completion specification UUID
  // or its associated milestone ID.
  private async resolveSpec(
    identifier: string
  ): Promise<CompletionSpec | null> {
    const byId = await this.repo.getSpecById(identifier);

    if (byId) {
      return byId;
    }

    return this.repo.getSpecByMilestone(identifier);
  }

  // 1. Create completion specification

  async createCompletionSpec(
    input: CreateCompletionSpecInput
  ): Promise<CompletionSpec> {
    if (!input.milestoneId.trim()) {
      throw new Error("Milestone ID is required.");
    }

    if (
      !Number.isInteger(input.minAttestations) ||
      input.minAttestations < 1
    ) {
      throw new Error(
        "Minimum attestations must be a positive integer."
      );
    }

    if (
      !Number.isInteger(input.windowDays) ||
      input.windowDays < 1
    ) {
      throw new Error(
        "Window days must be a positive integer."
      );
    }

    const existing = await this.repo.getSpecByMilestone(
      input.milestoneId
    );

    if (existing) {
      throw new Error(
        "A completion specification already exists."
      );
    }

    const now = new Date();

    const spec: CompletionSpec = {
      id: randomUUID(),
      milestoneId: input.milestoneId,
      spec: input.spec,
      minAttestations: input.minAttestations,
      windowDays: input.windowDays,
      createdAt: now,
      updatedAt: now,
    };

    return this.repo.createSpec(spec);
  }

  // 2. Retrieve completion specification

  async getCompletionSpec(
    milestoneId: string
  ): Promise<CompletionSpec | null> {
    return this.repo.getSpecByMilestone(milestoneId);
  }

  // 3. Submit completion proof

  async submitProof(
    identifier: string,
    input: CreateProofSubmissionInput
  ): Promise<ProofSubmission> {
    const spec = await this.resolveSpec(identifier);

    if (!spec) {
      throw new Error(
        "Completion specification not found."
      );
    }

    if (
      !Array.isArray(input.fileRefs) ||
      input.fileRefs.length === 0
    ) {
      throw new Error(
        "At least one proof file is required."
      );
    }

    if (
      !input.checklist ||
      Object.keys(input.checklist).length === 0
    ) {
      throw new Error(
        "Completion checklist cannot be empty."
      );
    }

    // A completion specification may have multiple proof submissions over
    // time, but only after the latest submission was rejected or marked
    // needs_more. Previous submissions and their reviews remain immutable
    // history; a resubmission always receives a new ID.
    const latestProof = await this.repo.getProofBySpecId(spec.id);

    if (latestProof) {
      const latestReview = await this.repo.getLatestProofReview(
        latestProof.id
      );

      if (!latestReview) {
        throw new Error(
          "The latest proof submission is awaiting review."
        );
      }

      if (latestReview.decision === "approved") {
        throw new Error(
          "An approved completion proof cannot be resubmitted."
        );
      }

      if (
        latestReview.decision !== "rejected" &&
        latestReview.decision !== "needs_more"
      ) {
        throw new Error(
          "A new proof can only be submitted after rejection or a needs_more decision."
        );
      }
    }

    const proof: ProofSubmission = {
      id: randomUUID(),
      specId: spec.id,
      fileRefs: [...input.fileRefs],
      checklist: { ...input.checklist },
      submittedAt: new Date(),
    };

    return this.repo.createProof(proof);
  }

  // 4. Retrieve proof using milestone ID

  async getProofForMilestone(
    milestoneId: string
  ): Promise<ProofSubmission | null> {
    const spec = await this.repo.getSpecByMilestone(
      milestoneId
    );

    if (!spec) {
      return null;
    }

    return this.repo.getProofBySpecId(spec.id);
  }

  // 5. Create reviewer decision.
  // Reviewer identity must come from a trusted server-side
  // authentication/authorization layer, not the request body.

  async createProofReview(
    submissionId: string,
    reviewerId: string,
    input: CreateProofReviewInput
  ): Promise<ProofReview> {
    const proof = await this.repo.getProofById(
      submissionId
    );

    if (!proof) {
      throw new Error("Proof submission not found.");
    }

    if (!reviewerId || !reviewerId.trim()) {
      throw new Error(
        "Authenticated reviewer identity is required."
      );
    }

    if (!input.reason || !input.reason.trim()) {
      throw new Error("Proof review reason is required.");
    }

    const review: ProofReview = {
      id: randomUUID(),
      submissionId,
      reviewerId: reviewerId.trim(),
      decision: input.decision,
      reason: input.reason.trim(),
      createdAt: new Date(),
    };

    return this.repo.createProofReview(review);
  }

  // 6. Generate household attestation links

  async generateAttestationLinks(
    identifier: string,
    householdIds: string[]
  ): Promise<AttestationLink[]> {
    const spec = await this.resolveSpec(identifier);

    if (!spec) {
      throw new Error(
        "Completion specification not found."
      );
    }

    if (
      !Array.isArray(householdIds) ||
      householdIds.length === 0
    ) {
      throw new Error(
        "At least one household must be invited."
      );
    }

    const normalizedIds = householdIds.map(
      (id) => id.trim()
    );

    if (normalizedIds.some((id) => !id)) {
      throw new Error("Household ID is required.");
    }

    if (
      new Set(normalizedIds).size !==
      normalizedIds.length
    ) {
      throw new Error(
        "Duplicate household IDs are not allowed."
      );
    }

    // Validate all households before inserting any records.
    for (const householdId of normalizedIds) {
      const existing =
        await this.repo.getAttestationByHousehold(
          spec.id,
          householdId
        );

      if (existing) {
        throw new Error(
          `Household ${householdId} has already been invited.`
        );
      }
    }

    const links: AttestationLink[] = [];

    for (const householdId of normalizedIds) {
      const token = generateToken();

      const expiresAt = new Date(
        Date.now() +
          spec.windowDays * 24 * 60 * 60 * 1000
      );

      const attestation: Attestation = {
        id: randomUUID(),
        specId: spec.id,
        householdId,
        tokenHash: hashToken(token, this.hmacSecret),
        expiresAt,
        createdAt: new Date(),
      };

      await this.repo.createAttestation(attestation);

      links.push({
        householdId,
        token,
        expiresAt,
      });
    }

    return links;
  }

  // 7. Validate attestation token

  async getAttestationByToken(
    token: string
  ): Promise<Attestation> {
    if (!token || !token.trim()) {
      throw new Error(
        "Attestation token is required."
      );
    }

    const tokenHash = hashToken(
      token,
      this.hmacSecret
    );

    const attestation =
      await this.repo.getAttestationByTokenHash(
        tokenHash
      );

    if (
      !attestation ||
      !verifyToken(
        token,
        attestation.tokenHash,
        this.hmacSecret
      )
    ) {
      throw new Error("Invalid attestation token.");
    }

    if (isTokenExpired(attestation.expiresAt)) {
      throw new Error(
        "Attestation link has expired."
      );
    }

    if (
      attestation.usedAt ||
      attestation.response
    ) {
      throw new Error(
        "Attestation link has already been used."
      );
    }

    return attestation;
  }

  // 8. Submit household attestation

  async submitAttestation(
    token: string,
    response: AttestationResponse
  ): Promise<Attestation> {
    if (
      response !== "works" &&
      response !== "not_working"
    ) {
      throw new Error("Invalid attestation response.");
    }

    // Validate the token, including its expiry and usage status.
    const attestation =
      await this.getAttestationByToken(token);

    // Redeem atomically. Only one request can successfully
    // change an unused attestation into a used attestation.
    const redeemed = await this.repo.redeemAttestation(
      attestation.id,
      response,
      new Date()
    );

    if (!redeemed) {
      throw new Error(
        "Attestation link has already been used or expired."
      );
    }

    return redeemed;
  }

  // 9. Evaluate Gate B eligibility

  async getGateBEligibility(
    identifier: string
  ): Promise<{
    eligible: boolean;
    trancheAComplete: boolean;
    worksCount: number;
    requiredCount: number;
    hasNotWorking: boolean;
    proofApproved: boolean;
    reasons: string[];
  }> {
    const spec = await this.resolveSpec(identifier);

    if (!spec) {
      throw new Error(
        "Completion specification not found."
      );
    }

    const proof = await this.repo.getProofBySpecId(
      spec.id
    );

    const attestations =
      await this.repo.getAttestationsBySpec(spec.id);

    const worksHouseholds = new Set(
      attestations
        .filter(
          (item) => item.response === "works"
        )
        .map((item) => item.householdId)
    );

    const hasNotWorking = attestations.some(
      (item) => item.response === "not_working"
    );

    const latestReview = proof
      ? await this.repo.getLatestProofReview(proof.id)
      : null;

    const proofApproved =
      latestReview?.decision === "approved";

    // P2 supplies the actual Tranche A payment/submission status.
    // If no trusted provider is configured, this returns false.
    const trancheAComplete =
      await this.gateBPrerequisiteProvider
        .isTrancheAPaidOrSubmitted(spec.milestoneId);

    const reasons: string[] = [];

    if (!trancheAComplete) {
      reasons.push(
        "Tranche A has not been confirmed as paid or submitted."
      );
    }

    if (
      worksHouseholds.size < spec.minAttestations
    ) {
      reasons.push(
        "Insufficient distinct household attestations."
      );
    }

    if (hasNotWorking) {
      reasons.push(
        "A not_working response is present."
      );
    }

    if (!proofApproved) {
      reasons.push(
        "Proof has not been approved by a reviewer."
      );
    }

    return {
      eligible: reasons.length === 0,
      trancheAComplete,
      worksCount: worksHouseholds.size,
      requiredCount: spec.minAttestations,
      hasNotWorking,
      proofApproved,
      reasons,
    };
  }
}
