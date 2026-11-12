
import { getPool } from "../../config/database.js";
import type { CompletionRepository } from "./repo.js";

import type {
  CompletionSpec,
  ProofSubmission,
  ProofReview,
  Attestation,
} from "./types.js";

import type { PoolClient } from "pg";

function mapSpec(row: any): CompletionSpec {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    spec: row.spec,
    minAttestations: row.min_attestations,
    windowDays: row.window_days,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapProof(row: any): ProofSubmission {
  return {
    id: row.id,
    specId: row.spec_id,
    fileRefs: row.file_refs,
    checklist: row.checklist,
    aiSummary: row.ai_summary ?? undefined,
    submittedAt: new Date(row.submitted_at),
  };
}

function mapReview(row: any): ProofReview {
  return {
    id: row.id,
    submissionId: row.submission_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    reason: row.reason,
    createdAt: new Date(row.created_at),
  };
}

function mapAttestation(row: any): Attestation {
  return {
    id: row.id,
    specId: row.spec_id,
    householdId: row.household_id,
    tokenHash: row.token_hash,
    response: row.response ?? undefined,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

export class PostgresCompletionRepository
  implements CompletionRepository
{
  // Completion specifications

  async createSpec(spec: CompletionSpec): Promise<CompletionSpec> {
    const result = await getPool().query(
      `INSERT INTO p4_completion_specs
       (id, milestone_id, spec, min_attestations, window_days,
        created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        spec.id,
        spec.milestoneId,
        JSON.stringify(spec.spec),
        spec.minAttestations,
        spec.windowDays,
        spec.createdAt,
        spec.updatedAt,
      ]
    );

    return mapSpec(result.rows[0]);
  }

  async getSpecById(id: string): Promise<CompletionSpec | null> {
    const result = await getPool().query(
      "SELECT * FROM p4_completion_specs WHERE id=$1",
      [id]
    );

    return result.rows[0] ? mapSpec(result.rows[0]) : null;
  }

  async getSpecByMilestone(
    milestoneId: string
  ): Promise<CompletionSpec | null> {
    const result = await getPool().query(
      "SELECT * FROM p4_completion_specs WHERE milestone_id=$1",
      [milestoneId]
    );

    return result.rows[0] ? mapSpec(result.rows[0]) : null;
  }

  // Proof submissions

  async createProof(proof: ProofSubmission): Promise<ProofSubmission> {
    const result = await getPool().query(
      `INSERT INTO p4_proof_submissions
       (id, spec_id, file_refs, checklist, ai_summary, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        proof.id,
        proof.specId,
        JSON.stringify(proof.fileRefs),
        JSON.stringify(proof.checklist),
        proof.aiSummary ? JSON.stringify(proof.aiSummary) : null,
        proof.submittedAt,
      ]
    );

    return mapProof(result.rows[0]);
  }

  async getProofById(id: string): Promise<ProofSubmission | null> {
    const result = await getPool().query(
      "SELECT * FROM p4_proof_submissions WHERE id=$1",
      [id]
    );

    return result.rows[0] ? mapProof(result.rows[0]) : null;
  }

  async getProofBySpecId(
    specId: string
  ): Promise<ProofSubmission | null> {
    const result = await getPool().query(
      `SELECT * FROM p4_proof_submissions
       WHERE spec_id=$1
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [specId]
    );

    return result.rows[0] ? mapProof(result.rows[0]) : null;
  }

  // Proof reviews

  async createProofReview(review: ProofReview): Promise<ProofReview> {
    const result = await getPool().query(
      `INSERT INTO p4_proof_reviews
       (id, submission_id, reviewer_id, decision, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        review.id,
        review.submissionId,
        review.reviewerId,
        review.decision,
        review.reason,
        review.createdAt,
      ]
    );

    return mapReview(result.rows[0]);
  }

  async getLatestProofReview(
    submissionId: string
  ): Promise<ProofReview | null> {
    const result = await getPool().query(
      `SELECT * FROM p4_proof_reviews
       WHERE submission_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [submissionId]
    );

    return result.rows[0] ? mapReview(result.rows[0]) : null;
  }

  // Attestations

  async createAttestation(
    attestation: Attestation
  ): Promise<Attestation> {
    const result = await getPool().query(
      `INSERT INTO p4_attestations
       (id, spec_id, household_id, token_hash, response,
        expires_at, used_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        attestation.id,
        attestation.specId,
        attestation.householdId,
        attestation.tokenHash,
        attestation.response ?? null,
        attestation.expiresAt,
        attestation.usedAt ?? null,
        attestation.createdAt,
      ]
    );

    return mapAttestation(result.rows[0]);
  }

  async getAttestationByTokenHash(
    tokenHash: string
  ): Promise<Attestation | null> {
    const result = await getPool().query(
      "SELECT * FROM p4_attestations WHERE token_hash=$1",
      [tokenHash]
    );

    return result.rows[0] ? mapAttestation(result.rows[0]) : null;
  }

  async getAttestationByHousehold(
    specId: string,
    householdId: string
  ): Promise<Attestation | null> {
    const result = await getPool().query(
      `SELECT * FROM p4_attestations
       WHERE spec_id=$1 AND household_id=$2`,
      [specId, householdId]
    );

    return result.rows[0] ? mapAttestation(result.rows[0]) : null;
  }

  async getAttestationsBySpec(
    specId: string
  ): Promise<Attestation[]> {
    const result = await getPool().query(
      "SELECT * FROM p4_attestations WHERE spec_id=$1",
      [specId]
    );

    return result.rows.map(mapAttestation);
  }

  /**
   * Atomically creates a batch of household attestations.
   *
   * Ownership validation and inserts happen inside the
   * same PostgreSQL transaction.
   */
  async createAttestationsForMilestone(
    milestoneId: string,
    attestations: Attestation[]
  ): Promise<Attestation[]> {
    if (!milestoneId?.trim()) {
      throw new Error("Milestone ID is required.");
    }

    if (
      !Array.isArray(attestations) ||
      attestations.length === 0 ||
      attestations.length > 1000
    ) {
      throw new Error("Invalid attestation batch size.");
    }

    const householdIds = attestations.map(
      (attestation) => attestation.householdId
    );

    const specIds = new Set(
      attestations.map((attestation) => attestation.specId)
    );

    if (
      householdIds.some((id) => !id) ||
      new Set(householdIds).size !== householdIds.length
    ) {
      throw new Error("Invalid or duplicate household IDs.");
    }

    if (specIds.size !== 1) {
      throw new Error(
        "All attestations must belong to the same completion specification."
      );
    }

    const specId = attestations[0].specId;

    if (!specId) {
      throw new Error("Completion specification ID is required.");
    }

    const client: PoolClient = await getPool().connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      // 1. Lock and validate milestone.
      const milestoneResult = await client.query(
        `SELECT project_id
         FROM milestones
         WHERE id=$1
         FOR SHARE`,
        [milestoneId]
      );

      if (!milestoneResult.rows[0]) {
        throw new Error("Milestone not found.");
      }

      const projectId = milestoneResult.rows[0].project_id;

      // 2. Lock and validate completion specification.
      const specResult = await client.query(
        `SELECT id
         FROM p4_completion_specs
         WHERE id=$1 AND milestone_id=$2
         FOR SHARE`,
        [specId, milestoneId]
      );

      if (!specResult.rows[0]) {
        throw new Error(
          "Completion specification does not belong to this milestone."
        );
      }

      // 3. Lock and revalidate household ownership.
      const householdResult = await client.query(
        `SELECT id
         FROM households
         WHERE project_id=$1
           AND id=ANY($2::uuid[])
         FOR SHARE`,
        [projectId, householdIds]
      );

      if (householdResult.rows.length !== householdIds.length) {
        throw new Error(
          "One or more households do not belong to the milestone's project."
        );
      }

      // 4. Insert all attestations within the transaction.
      const inserted: Attestation[] = [];

      for (const attestation of attestations) {
        const result = await client.query(
          `INSERT INTO p4_attestations
           (id, spec_id, household_id, token_hash,
            expires_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [
            attestation.id,
            attestation.specId,
            attestation.householdId,
            attestation.tokenHash,
            attestation.expiresAt,
            attestation.createdAt,
          ]
        );

        inserted.push(mapAttestation(result.rows[0]));
      }

      // 5. Commit only after every insert succeeds.
      await client.query("COMMIT");
      transactionStarted = false;

      return inserted;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original transaction error.
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atomically redeems an unused, unexpired attestation.
   */
  async redeemAttestation(
    id: string,
    response: "works" | "not_working",
    now: Date
  ): Promise<Attestation | null> {
    const result = await getPool().query(
      `UPDATE p4_attestations
       SET response=$2, used_at=$3
       WHERE id=$1
         AND used_at IS NULL
         AND response IS NULL
         AND expires_at > $3
       RETURNING *`,
      [id, response, now]
    );

    return result.rows[0] ? mapAttestation(result.rows[0]) : null;
  }

  async updateAttestation(
    attestation: Attestation
  ): Promise<Attestation> {
    const result = await getPool().query(
      `UPDATE p4_attestations
       SET response=$2, used_at=$3
       WHERE id=$1
         AND spec_id=$4
         AND household_id=$5
         AND token_hash=$6
         AND expires_at=$7
       RETURNING *`,
      [
        attestation.id,
        attestation.response ?? null,
        attestation.usedAt ?? null,
        attestation.specId,
        attestation.householdId,
        attestation.tokenHash,
        attestation.expiresAt,
      ]
    );

    if (!result.rows[0]) {
      throw new Error("Attestation not found or immutable.");
    }

    return mapAttestation(result.rows[0]);
  }
}
