
import type { Pool, PoolClient } from "pg";
import { getPool } from "../../config/database.js";

import type { EvidenceRepository } from "./repo.js";

import type {
  EvidenceRecord,
  InvoiceMetadata,
  ExpenseRecord,
  EvidenceFlag,
  VerificationReview,
  VerificationReviewAuditEvent,
} from "./types.js";

type DbRow = Record<string, unknown>;

function jsonValue<T>(value: unknown): T | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function optionalDate(value: unknown): Date | undefined {
  return value == null ? undefined : dateValue(value);
}

function mapEvidence(row: DbRow): EvidenceRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    milestoneId: row.milestone_id == null ? undefined : String(row.milestone_id),
    expenseId: row.expense_id == null ? undefined : String(row.expense_id),
    uploadedBy: String(row.uploaded_by),
    originalFileName: String(row.original_file_name),
    storageKey: String(row.storage_key),
    mimeType: row.mime_type as EvidenceRecord["mimeType"],
    fileSize: Number(row.file_size),
    status: row.status as EvidenceRecord["status"],
    extractedMetadata: jsonValue<InvoiceMetadata>(row.extracted_metadata),
    confirmedMetadata: jsonValue<InvoiceMetadata>(row.confirmed_metadata),
    confidence: jsonValue<Record<string, number>>(row.confidence),
    extractionProvider: row.extraction_provider == null
      ? undefined
      : String(row.extraction_provider),
    uploadedAt: dateValue(row.uploaded_at),
    updatedAt: dateValue(row.updated_at),
  };
}

function mapExpense(row: DbRow): ExpenseRecord {
  const expenseDate = row.expense_date instanceof Date
    ? row.expense_date.toISOString().slice(0, 10)
    : String(row.expense_date).slice(0, 10);

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    budgetId: String(row.budget_id),
    vendor: String(row.vendor),
    amountMinor: Number(row.amount_minor),
    currency: row.currency == null ? undefined : String(row.currency),
    date: expenseDate,
    reviewStatus: String(row.review_status),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
  };
}

function mapFlag(row: DbRow): EvidenceFlag {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    evidenceId: row.evidence_id == null ? undefined : String(row.evidence_id),
    flagType: row.flag_type as EvidenceFlag["flagType"],
    explanation: String(row.explanation),
    status: row.status as EvidenceFlag["status"],
    createdAt: dateValue(row.created_at),
    supersededAt: optionalDate(row.superseded_at),
    supersededReason: row.superseded_reason == null
      ? undefined
      : String(row.superseded_reason),
  };
}

function mapReview(row: DbRow): VerificationReview {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    evidenceId: row.evidence_id == null ? undefined : String(row.evidence_id),
    flagType: row.flag_type as VerificationReview["flagType"],
    explanation: String(row.explanation),
    reviewerId: row.reviewer_id == null ? undefined : String(row.reviewer_id),
    resolution: row.resolution == null
      ? undefined
      : row.resolution as VerificationReview["resolution"],
    reason: row.reason == null ? undefined : String(row.reason),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    status: row.status as VerificationReview["status"],
    supersededAt: optionalDate(row.superseded_at),
    supersededReason: row.superseded_reason == null
      ? undefined
      : String(row.superseded_reason),
  };
}

function mapAuditEvent(row: DbRow): VerificationReviewAuditEvent {
  return {
    id: String(row.id),
    reviewId: String(row.review_id),
    expenseId: String(row.expense_id),
    evidenceId: row.evidence_id == null ? undefined : String(row.evidence_id),
    reviewerId: row.reviewer_id == null ? undefined : String(row.reviewer_id),
    previousResolution: row.previous_resolution == null
      ? undefined
      : row.previous_resolution as VerificationReviewAuditEvent["previousResolution"],
    newResolution: row.new_resolution == null
      ? undefined
      : row.new_resolution as VerificationReviewAuditEvent["newResolution"],
    previousReason: row.previous_reason == null
      ? undefined
      : String(row.previous_reason),
    newReason: row.new_reason == null ? undefined : String(row.new_reason),
    action: row.action as VerificationReviewAuditEvent["action"],
    createdAt: dateValue(row.created_at),
  };
}

async function insertReviewAuditEvent(
  client: PoolClient,
  event: VerificationReviewAuditEvent
): Promise<VerificationReviewAuditEvent> {
  const result = await client.query(
    `INSERT INTO p4_review_audit_events (
      id, review_id, expense_id, evidence_id, reviewer_id,
      previous_resolution, new_resolution, previous_reason,
      new_reason, action, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      event.id,
      event.reviewId,
      event.expenseId,
      event.evidenceId ?? null,
      event.reviewerId ?? null,
      event.previousResolution ?? null,
      event.newResolution ?? null,
      event.previousReason ?? null,
      event.newReason ?? null,
      event.action,
      event.createdAt,
    ]
  );

  return mapAuditEvent(result.rows[0] as DbRow);
}

export class PostgresEvidenceRepository implements EvidenceRepository {
  private get db(): Pool {
    return getPool();
  }

  async createEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    const result = await this.db.query(
      `INSERT INTO p4_evidence (
        id, project_id, milestone_id, expense_id, uploaded_by,
        original_file_name, storage_key, mime_type, file_size, status,
        extracted_metadata, confirmed_metadata, confidence,
        extraction_provider, uploaded_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      ) RETURNING *`,
      [
        evidence.id,
        evidence.projectId,
        evidence.milestoneId ?? null,
        evidence.expenseId ?? null,
        evidence.uploadedBy,
        evidence.originalFileName,
        evidence.storageKey,
        evidence.mimeType,
        evidence.fileSize,
        evidence.status,
        evidence.extractedMetadata ?? null,
        evidence.confirmedMetadata ?? null,
        evidence.confidence ?? null,
        evidence.extractionProvider ?? null,
        evidence.uploadedAt,
        evidence.updatedAt,
      ]
    );

    return mapEvidence(result.rows[0] as DbRow);
  }

  async getEvidenceById(id: string): Promise<EvidenceRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM p4_evidence WHERE id = $1",
      [id]
    );

    return result.rows[0] ? mapEvidence(result.rows[0] as DbRow) : null;
  }

  async getEvidenceByProject(projectId: string): Promise<EvidenceRecord[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_evidence WHERE project_id = $1 ORDER BY uploaded_at DESC",
      [projectId]
    );

    return result.rows.map((row) => mapEvidence(row as DbRow));
  }

  async updateEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    const result = await this.db.query(
      `UPDATE p4_evidence SET
        project_id=$2, milestone_id=$3, expense_id=$4, uploaded_by=$5,
        original_file_name=$6, storage_key=$7, mime_type=$8,
        file_size=$9, status=$10, extracted_metadata=$11,
        confirmed_metadata=$12, confidence=$13, extraction_provider=$14,
        updated_at=$15
       WHERE id=$1 RETURNING *`,
      [
        evidence.id,
        evidence.projectId,
        evidence.milestoneId ?? null,
        evidence.expenseId ?? null,
        evidence.uploadedBy,
        evidence.originalFileName,
        evidence.storageKey,
        evidence.mimeType,
        evidence.fileSize,
        evidence.status,
        evidence.extractedMetadata ?? null,
        evidence.confirmedMetadata ?? null,
        evidence.confidence ?? null,
        evidence.extractionProvider ?? null,
        evidence.updatedAt,
      ]
    );

    if (!result.rows[0]) throw new Error("Evidence not found.");
    return mapEvidence(result.rows[0] as DbRow);
  }

  async updateExtractedMetadata(
    id: string,
    metadata: InvoiceMetadata,
    provider: string,
    confidence?: Record<string, number>
  ): Promise<EvidenceRecord> {
    const result = await this.db.query(
      `UPDATE p4_evidence SET
        extracted_metadata=$2,
        extraction_provider=$3,
        confidence=$4,
        status='extracted',
        updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, metadata, provider, confidence ?? null]
    );

    if (!result.rows[0]) throw new Error("Evidence not found.");
    return mapEvidence(result.rows[0] as DbRow);
  }

  async createExpense(expense: ExpenseRecord): Promise<ExpenseRecord> {
    const result = await this.db.query(
      `INSERT INTO p4_expenses (
        id, project_id, budget_id, vendor, amount_minor,
        currency, expense_date, review_status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        expense.id,
        expense.projectId,
        expense.budgetId,
        expense.vendor,
        expense.amountMinor,
        expense.currency ?? null,
        expense.date,
        expense.reviewStatus,
        expense.createdAt,
        expense.updatedAt,
      ]
    );

    return mapExpense(result.rows[0] as DbRow);
  }

  async getExpenseById(id: string): Promise<ExpenseRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM p4_expenses WHERE id=$1",
      [id]
    );

    return result.rows[0] ? mapExpense(result.rows[0] as DbRow) : null;
  }

  async getExpensesByProject(projectId: string): Promise<ExpenseRecord[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_expenses WHERE project_id=$1 ORDER BY created_at DESC",
      [projectId]
    );

    return result.rows.map((row) => mapExpense(row as DbRow));
  }

  async updateExpense(expense: ExpenseRecord): Promise<ExpenseRecord> {
    const result = await this.db.query(
      `UPDATE p4_expenses SET
        project_id=$2, budget_id=$3, vendor=$4, amount_minor=$5,
        currency=$6, expense_date=$7, review_status=$8, updated_at=$9
       WHERE id=$1 RETURNING *`,
      [
        expense.id,
        expense.projectId,
        expense.budgetId,
        expense.vendor,
        expense.amountMinor,
        expense.currency ?? null,
        expense.date,
        expense.reviewStatus,
        expense.updatedAt,
      ]
    );

    if (!result.rows[0]) throw new Error("Expense not found.");
    return mapExpense(result.rows[0] as DbRow);
  }

  async createEvidenceFlag(flag: EvidenceFlag): Promise<EvidenceFlag> {
    const result = await this.db.query(
      `INSERT INTO p4_evidence_flags (
        id, expense_id, evidence_id, flag_type, explanation,
        status, created_at, superseded_at, superseded_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        flag.id,
        flag.expenseId,
        flag.evidenceId ?? null,
        flag.flagType,
        flag.explanation,
        flag.status ?? "active",
        flag.createdAt,
        flag.supersededAt ?? null,
        flag.supersededReason ?? null,
      ]
    );

    return mapFlag(result.rows[0] as DbRow);
  }

  async getFlagsByExpense(expenseId: string): Promise<EvidenceFlag[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_evidence_flags WHERE expense_id=$1 ORDER BY created_at DESC",
      [expenseId]
    );

    return result.rows.map((row) => mapFlag(row as DbRow));
  }

  async getFlagsByEvidence(evidenceId: string): Promise<EvidenceFlag[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_evidence_flags WHERE evidence_id=$1 ORDER BY created_at DESC",
      [evidenceId]
    );

    return result.rows.map((row) => mapFlag(row as DbRow));
  }

  async supersedeActiveFlagsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<EvidenceFlag[]> {
    const result = await this.db.query(
      `UPDATE p4_evidence_flags SET
        status='superseded', superseded_at=NOW(), superseded_reason=$2
       WHERE evidence_id=$1 AND status='active'
       RETURNING *`,
      [evidenceId, reason]
    );

    return result.rows.map((row) => mapFlag(row as DbRow));
  }

  async createVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    const result = await this.db.query(
      `INSERT INTO p4_verification_reviews (
        id, expense_id, evidence_id, flag_type, explanation,
        reviewer_id, resolution, reason, status, created_at,
        updated_at, superseded_at, superseded_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        review.id,
        review.expenseId,
        review.evidenceId ?? null,
        review.flagType,
        review.explanation,
        review.reviewerId ?? null,
        review.resolution ?? null,
        review.reason ?? null,
        review.status ?? "active",
        review.createdAt,
        review.updatedAt,
        review.supersededAt ?? null,
        review.supersededReason ?? null,
      ]
    );

    return mapReview(result.rows[0] as DbRow);
  }

  async getVerificationReviewById(
    id: string
  ): Promise<VerificationReview | null> {
    const result = await this.db.query(
      "SELECT * FROM p4_verification_reviews WHERE id=$1",
      [id]
    );

    return result.rows[0] ? mapReview(result.rows[0] as DbRow) : null;
  }

  async getReviewsByExpense(expenseId: string): Promise<VerificationReview[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_verification_reviews WHERE expense_id=$1 ORDER BY created_at DESC",
      [expenseId]
    );

    return result.rows.map((row) => mapReview(row as DbRow));
  }

  async getReviewsByEvidence(evidenceId: string): Promise<VerificationReview[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_verification_reviews WHERE evidence_id=$1 ORDER BY created_at DESC",
      [evidenceId]
    );

    return result.rows.map((row) => mapReview(row as DbRow));
  }

  async updateVerificationReview(
    review: VerificationReview
  ): Promise<VerificationReview> {
    const result = await this.db.query(
      `UPDATE p4_verification_reviews SET
        expense_id=$2, evidence_id=$3, flag_type=$4, explanation=$5,
        reviewer_id=$6, resolution=$7, reason=$8, status=$9,
        updated_at=$10, superseded_at=$11, superseded_reason=$12
       WHERE id=$1 RETURNING *`,
      [
        review.id,
        review.expenseId,
        review.evidenceId ?? null,
        review.flagType,
        review.explanation,
        review.reviewerId ?? null,
        review.resolution ?? null,
        review.reason ?? null,
        review.status ?? "active",
        review.updatedAt,
        review.supersededAt ?? null,
        review.supersededReason ?? null,
      ]
    );

    if (!result.rows[0]) throw new Error("Verification review not found.");
    return mapReview(result.rows[0] as DbRow);
  }

  /**
   * Atomically updates a review and appends its audit event.
   */
  async resolveVerificationReviewWithAudit(
    review: VerificationReview,
    event: VerificationReviewAuditEvent
  ): Promise<VerificationReview> {
    const client = await this.db.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const existingResult = await client.query(
        `SELECT * FROM p4_verification_reviews
         WHERE id=$1
         FOR UPDATE`,
        [review.id]
      );

      if (!existingResult.rows[0]) {
        throw new Error("Verification review not found.");
      }

      const existing = mapReview(existingResult.rows[0] as DbRow);

      if (
        existing.expenseId !== review.expenseId ||
        existing.evidenceId !== review.evidenceId ||
        existing.flagType !== review.flagType
      ) {
        throw new Error("Review identity fields cannot be changed.");
      }

      if (
        event.reviewId !== review.id ||
        event.expenseId !== review.expenseId ||
        event.evidenceId !== review.evidenceId ||
        event.action !== "updated"
      ) {
        throw new Error("Review audit event does not match the review update.");
      }

      const updateResult = await client.query(
        `UPDATE p4_verification_reviews SET
          reviewer_id=$2,
          resolution=$3,
          reason=$4,
          status=$5,
          updated_at=$6
         WHERE id=$1
         RETURNING *`,
        [
          review.id,
          review.reviewerId ?? null,
          review.resolution ?? null,
          review.reason ?? null,
          review.status ?? existing.status ?? "active",
          review.updatedAt,
        ]
      );

      if (!updateResult.rows[0]) {
        throw new Error("Verification review not found.");
      }

      await insertReviewAuditEvent(client, event);

      const updated = mapReview(updateResult.rows[0] as DbRow);

      await client.query("COMMIT");
      transactionStarted = false;

      return updated;
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

  async createReviewAuditEvent(
    event: VerificationReviewAuditEvent
  ): Promise<VerificationReviewAuditEvent> {
    const result = await this.db.query(
      `INSERT INTO p4_review_audit_events (
        id, review_id, expense_id, evidence_id, reviewer_id,
        previous_resolution, new_resolution, previous_reason,
        new_reason, action, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        event.id,
        event.reviewId,
        event.expenseId,
        event.evidenceId ?? null,
        event.reviewerId ?? null,
        event.previousResolution ?? null,
        event.newResolution ?? null,
        event.previousReason ?? null,
        event.newReason ?? null,
        event.action,
        event.createdAt,
      ]
    );

    return mapAuditEvent(result.rows[0] as DbRow);
  }

  async getReviewAuditHistory(
    reviewId: string
  ): Promise<VerificationReviewAuditEvent[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_review_audit_events WHERE review_id=$1 ORDER BY created_at ASC",
      [reviewId]
    );

    return result.rows.map((row) => mapAuditEvent(row as DbRow));
  }

  async getReviewAuditHistoryByEvidence(
    evidenceId: string
  ): Promise<VerificationReviewAuditEvent[]> {
    const result = await this.db.query(
      "SELECT * FROM p4_review_audit_events WHERE evidence_id=$1 ORDER BY created_at ASC",
      [evidenceId]
    );

    return result.rows.map((row) => mapAuditEvent(row as DbRow));
  }

  async supersedeReviewsByEvidence(
    evidenceId: string,
    reason: string
  ): Promise<VerificationReview[]> {
    const result = await this.db.query(
      `UPDATE p4_verification_reviews SET
        status='superseded',
        superseded_at=NOW(),
        superseded_reason=$2,
        updated_at=NOW()
       WHERE evidence_id=$1 AND status='active'
       RETURNING *`,
      [evidenceId, reason]
    );

    return result.rows.map((row) => mapReview(row as DbRow));
  }

  /**
   * Atomically supersedes active evidence flags and reviews,
   * and appends audit events for the superseded reviews.
   */
  async invalidateEvidenceReviews(
    evidenceId: string,
    reason: string
  ): Promise<void> {
    const client = await this.db.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      // Lock the evidence row so concurrent invalidations serialize.
      const evidenceResult = await client.query(
        `SELECT id FROM p4_evidence
         WHERE id=$1
         FOR UPDATE`,
        [evidenceId]
      );

      if (!evidenceResult.rows[0]) {
        throw new Error("Evidence record not found.");
      }

      await client.query(
        `UPDATE p4_evidence_flags SET
          status='superseded',
          superseded_at=NOW(),
          superseded_reason=$2
         WHERE evidence_id=$1
           AND status='active'`,
        [evidenceId, reason]
      );

      const reviewsResult = await client.query(
        `UPDATE p4_verification_reviews SET
          status='superseded',
          superseded_at=NOW(),
          superseded_reason=$2,
          updated_at=NOW()
         WHERE evidence_id=$1
           AND status='active'
         RETURNING *`,
        [evidenceId, reason]
      );

      const supersededReviews = reviewsResult.rows.map(
        (row) => mapReview(row as DbRow)
      );

      for (const review of supersededReviews) {
        const event: VerificationReviewAuditEvent = {
          id: crypto.randomUUID(),
          reviewId: review.id,
          expenseId: review.expenseId,
          evidenceId: review.evidenceId,
          reviewerId: review.reviewerId,
          previousResolution: review.resolution,
          newResolution: review.resolution,
          previousReason: review.reason,
          newReason: reason,
          action: "superseded",
          createdAt: new Date(),
        };

        await insertReviewAuditEvent(client, event);
      }

      await client.query("COMMIT");
      transactionStarted = false;
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
}
