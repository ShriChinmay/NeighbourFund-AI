
import { z } from "zod";

// ==========================================
// A1: Brief Helper
// ==========================================

export const BriefDraftSchema = z.object({
  summary: z.string().min(1),
  milestones: z.array(z.string().min(1)),
  budgetLines: z.array(
    z.object({
      name: z.string().min(1),
      amountMinor: z.number().int().nonnegative(),
    })
  ),
});

export type BriefDraft = z.infer<typeof BriefDraftSchema>;

// ==========================================
// A2: Document Extraction
// ==========================================

export const ExtractedDocSchema = z.object({
  vendor: z.string().min(1),
  date: z.string().min(1),
  lineItems: z.array(
    z.object({
      description: z.string().min(1),
      amountMinor: z.number().int().nonnegative(),
    })
  ),
  total: z.number().int().nonnegative(),
  confidence: z.object({
    vendor: z.number().min(0).max(1),
    date: z.number().min(0).max(1),
    lineItems: z.number().min(0).max(1),
    total: z.number().min(0).max(1),
  }),
});

export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;

// ==========================================
// A3: Discrepancy Explainer
// ==========================================

export const DiscExplainSchema = z.object({
  flagType: z.string().min(1),
  explanation: z.string().min(1),
});

export type DiscExplain = z.infer<typeof DiscExplainSchema>;

// ==========================================
// A4: Funding Mix Planner
// ==========================================

export const FundingMixSchema = z.object({
  lines: z.array(
    z.object({
      sourceType: z.string().min(1),
      amountMinor: z.number().int().nonnegative(),
      rationale: z.string().min(1),
      risks: z.array(z.string()),
    })
  ),
});

export type FundingMix = z.infer<typeof FundingMixSchema>;

// ==========================================
// A5: Sponsor Brief and Proof Pack
// ==========================================

export const SponsorBriefSchema = z.object({
  brief: z.string().min(1),
  proofPack: z.array(
    z.object({
      statement: z.string().min(1),
      status: z.enum(["verified", "claimed", "unknown"]),
      recordIds: z.array(z.string()).default([]),
    }).refine(
      (section) =>
        section.status !== "verified" ||
        section.recordIds.length > 0,
      {
        message: "Verified statements must reference database records",
        path: ["recordIds"],
      }
    )
  ),
});

export type SponsorBrief = z.infer<typeof SponsorBriefSchema>;

// ==========================================
// A6: Completion Proof Reviewer
// ==========================================

export const ProofReviewSchema = z.object({
  items: z.array(
    z.object({
      itemName: z.string().min(1),
      expectedCount: z.number().int().nonnegative(),
      observedCount: z.number().int().nonnegative(),
      matches: z.array(z.string()),
      cannotConfirm: z.array(z.string()),
    }).refine(
      (item) => item.observedCount <= item.expectedCount,
      {
        message: "Observed count cannot exceed expected count",
        path: ["observedCount"],
      }
    )
  ),
  summary: z.string().min(1),
});

export type ProofReview = z.infer<typeof ProofReviewSchema>;

// ==========================================
// A7: Predefined Q&A
// ==========================================

export const QaAnswerSchema = z.object({
  answer: z.string().min(1),
  recordReferences: z.array(z.string()),
  refused: z.boolean(),
});

export type QaAnswer = z.infer<typeof QaAnswerSchema>;
