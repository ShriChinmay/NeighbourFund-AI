import { z } from "zod";

// --------------------------------------------------
// Evidence upload configuration
// --------------------------------------------------

export const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024;

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// --------------------------------------------------
// Common validation schemas
// --------------------------------------------------

export const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Currency must be a valid three-letter uppercase code.");

// --------------------------------------------------
// Invoice line-item validation
// --------------------------------------------------

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),

  quantity: z.number().positive().optional(),

  unitPriceMinor: z.number().int().nonnegative().optional(),

  amountMinor: z.number().int().nonnegative(),
}).strict();

// --------------------------------------------------
// Invoice metadata validation
// --------------------------------------------------

export const invoiceMetadataSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(255).optional(),

  vendorName: z.string().trim().min(1).max(255).optional(),

  invoiceDate: z.iso.date().optional(),

  // Legacy field name retained to avoid breaking
  // the existing service and tests.
  // Must use the same minor-unit convention as expenses.
  totalAmountCents: z.number().int().nonnegative().optional(),

  currency: currencySchema.optional(),

  description: z.string().trim().max(1000).optional(),

  lineItems: z.array(invoiceLineItemSchema).max(500).optional(),
}).strict();

// --------------------------------------------------
// Extraction confidence validation
// --------------------------------------------------

export const extractionConfidenceSchema = z.record(
  z.string().trim().min(1),
  z.number().min(0).max(1)
);

// --------------------------------------------------
// Public evidence upload request
// --------------------------------------------------

export const createEvidenceRequestSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),

  milestoneId: z.string().trim().min(1).optional(),

  expenseId: z.string().trim().min(1).optional(),

  originalFileName: z.string().trim().min(1).max(255),

  mimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES),

  fileSize: z.number()
    .int()
    .positive()
    .max(
      MAX_EVIDENCE_FILE_SIZE,
      "File size cannot exceed 10 MB."
    ),
}).strict();

export type CreateEvidenceRequestData = z.infer<
  typeof createEvidenceRequestSchema
>;

// --------------------------------------------------
// Evidence creation validation
// --------------------------------------------------

export const createEvidenceSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),

  milestoneId: z.string().trim().min(1).optional(),

  expenseId: z.string().trim().min(1).optional(),

  uploadedBy: z.string().trim().min(1, "Uploader ID is required."),

  originalFileName: z.string().trim().min(1).max(255),

  storageKey: z.string().trim().min(1),

  mimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES),

  fileSize: z.number()
    .int()
    .positive()
    .max(
      MAX_EVIDENCE_FILE_SIZE,
      "File size cannot exceed 10 MB."
    ),
}).strict();

// --------------------------------------------------
// Evidence metadata update validation
// --------------------------------------------------

export const updateEvidenceMetadataSchema = z.object({
  metadata: invoiceMetadataSchema,
}).strict();

// --------------------------------------------------
// Uploaded file validation
// --------------------------------------------------

export const evidenceUploadSchema = z.object({
  originalName: z.string().trim().min(1).max(255),

  mimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES),

  size: z.number()
    .int()
    .positive()
    .max(
      MAX_EVIDENCE_FILE_SIZE,
      "File size cannot exceed 10 MB."
    ),

  storageKey: z.string().trim().min(1),
}).strict();

// --------------------------------------------------
// Expense validation
// --------------------------------------------------

export const createExpenseSchema = z.object({
  projectId: z.string().trim().min(1),

  budgetId: z.string().trim().min(1),

  vendor: z.string().trim().min(1).max(255),

  amountMinor: z.number().int().positive(),

  currency: currencySchema.optional(),

  date: z.iso.date(),

  reviewStatus: z.string().trim().min(1),
}).strict();

// --------------------------------------------------
// Complete expense record validation
// --------------------------------------------------

export const expenseRecordSchema = createExpenseSchema.extend({
  id: z.string().trim().min(1),

  createdAt: z.coerce.date(),

  updatedAt: z.coerce.date(),
}).strict();

// --------------------------------------------------
// Evidence discrepancy flag validation
// --------------------------------------------------

export const flagTypeSchema = z.enum([
  "amount_differs",
  "line_missing",
  "duplicate_invoice",
  "vendor_mismatch",
  "low_confidence",
]);

export const evidenceFlagSchema = z.object({
  id: z.string().trim().min(1),

  expenseId: z.string().trim().min(1),

  flagType: flagTypeSchema,

  explanation: z.string().trim().min(1).max(2000),

  createdAt: z.coerce.date(),
}).strict();

// --------------------------------------------------
// Verification review validation
// --------------------------------------------------

export const reviewResolutionSchema = z.enum([
  "explained",
  "more_info",
  "rejected",
  "approved",
]);

export const verificationReviewSchema = z.object({
  id: z.string().trim().min(1),

  expenseId: z.string().trim().min(1),

  flagType: flagTypeSchema,

  explanation: z.string().trim().min(1).max(2000),

  reviewerId: z.string().trim().min(1).optional(),

  resolution: reviewResolutionSchema.optional(),

  reason: z.string().trim().max(2000).optional(),

  createdAt: z.coerce.date(),

  updatedAt: z.coerce.date(),
}).strict();

// --------------------------------------------------
// Inferred TypeScript types
// --------------------------------------------------

export type CreateEvidenceData = z.infer<
  typeof createEvidenceSchema
>;

export type InvoiceMetadataData = z.infer<
  typeof invoiceMetadataSchema
>;

export type InvoiceLineItemData = z.infer<
  typeof invoiceLineItemSchema
>;

export type ExtractionConfidenceData = z.infer<
  typeof extractionConfidenceSchema
>;

export type UpdateEvidenceMetadataData = z.infer<
  typeof updateEvidenceMetadataSchema
>;

export type EvidenceUploadData = z.infer<
  typeof evidenceUploadSchema
>;

export type CreateExpenseData = z.infer<
  typeof createExpenseSchema
>;

export type ExpenseRecordData = z.infer<
  typeof expenseRecordSchema
>;

export type EvidenceFlagData = z.infer<
  typeof evidenceFlagSchema
>;

export type VerificationReviewData = z.infer<
  typeof verificationReviewSchema
>;
