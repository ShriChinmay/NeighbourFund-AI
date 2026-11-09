import { z } from "zod";

export const createCompletionSpecSchema = z.object({
  milestoneId: z.string().trim().min(1, "Milestone ID is required.").max(255),
  spec: z.record(z.string(), z.unknown()),
  minAttestations: z.number().int().positive(),
  windowDays: z.number().int().positive(),
}).strict();

export const createProofSubmissionSchema = z.object({
  fileRefs: z.array(z.string().trim().min(1).max(2048)).min(1, "At least one proof file is required.").max(20),
  checklist: z.record(z.string(), z.boolean()),
}).strict();

export const createProofReviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_more"]),
  reason: z.string().trim().min(1, "Review reason is required.").max(2000),
}).strict();

export const createAttestationSchema = z.object({
  householdId: z.string().trim().min(1, "Household ID is required.").max(255),
}).strict();

export const submitAttestationSchema = z.object({
  token: z.string().trim().min(1, "Attestation token is required."),
  response: z.enum(["works", "not_working"]),
}).strict();

export type CreateCompletionSpecData = z.infer<typeof createCompletionSpecSchema>;
export type CreateProofSubmissionData = z.infer<typeof createProofSubmissionSchema>;
export type CreateProofReviewData = z.infer<typeof createProofReviewSchema>;
export type SubmitAttestationData = z.infer<typeof submitAttestationSchema>;
