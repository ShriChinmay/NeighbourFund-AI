export type EvidenceStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "confirmed"
  | "rejected";

export type EvidenceFileType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unitPriceMinor?: number;
  amountMinor: number;
}

export interface InvoiceMetadata {
  invoiceNumber?: string;
  vendorName?: string;
  invoiceDate?: string;
  totalAmountCents?: number;
  currency?: string;
  description?: string;
  lineItems?: InvoiceLineItem[];
}

export interface EvidenceRecord {
  id: string;
  projectId: string;
  milestoneId?: string;
  expenseId?: string;
  uploadedBy: string;

  originalFileName: string;
  storageKey: string;
  mimeType: EvidenceFileType;
  fileSize: number;

  status: EvidenceStatus;

  extractedMetadata?: InvoiceMetadata;
  confirmedMetadata?: InvoiceMetadata;

  confidence?: Record<string, number>;
  extractionProvider?: string;

  uploadedAt: Date;
  updatedAt: Date;
}

export interface CreateEvidenceInput {
  projectId: string;
  milestoneId?: string;
  expenseId?: string;
  uploadedBy: string;

  originalFileName: string;
  storageKey: string;
  mimeType: EvidenceFileType;
  fileSize: number;
}

export interface UpdateEvidenceMetadataInput {
  metadata: InvoiceMetadata;
}

export interface EvidenceUploadFile {
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
}

export interface InvoiceExtractionResult {
  metadata: InvoiceMetadata;
  provider: string;
  confidence?: Record<string, number>;
}

export type FlagType =
  | "amount_differs"
  | "line_missing"
  | "duplicate_invoice"
  | "vendor_mismatch"
  | "low_confidence";

export type ReviewResolution =
  | "explained"
  | "more_info"
  | "rejected"
  | "approved";

export interface ExpenseRecord {
  id: string;
  projectId: string;
  budgetId: string;
  vendor: string;
  amountMinor: number;
  currency?: string;
  date: string;
  reviewStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvidenceFlag {
  id: string;
  expenseId: string;
  flagType: FlagType;
  explanation: string;
  createdAt: Date;
}

export interface VerificationReview {
  id: string;
  expenseId: string;
  flagType: FlagType;
  explanation: string;
  reviewerId?: string;
  resolution?: ReviewResolution;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}
