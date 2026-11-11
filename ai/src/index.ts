
 // A1 - Brief Helper
export { draftBrief } from "./workflows/brief.workflow.js";
export type {
  BriefInput,
  AiResult,
} from "./workflows/brief.workflow.js";

// A2 - Document Extraction
export { extractDocument } from "./workflows/document.workflow.js";
export type {
  DocumentInput,
  DocumentResult,
} from "./workflows/document.workflow.js";

// A3 - Discrepancy Explanation
export { explainDiscrepancy } from "./workflows/discrepancy.workflow.js";
export type {
  DiscrepancyInput,
  DiscrepancyResult,
  DiscrepancyAiResult,
} from "./workflows/discrepancy.workflow.js";

// A4 - Funding Mix Planner
export { planFundingMix } from "./workflows/funding.workflow.js";
export type {
  FundingInput,
  FundingResult,
  FundingAiResult,
} from "./workflows/funding.workflow.js";

// A5 - Sponsor Brief
export { createSponsorBrief } from "./workflows/sponsor.workflow.js";
export type {
  SponsorResult,
} from "./workflows/sponsor.workflow.js";

// A6 - Completion Proof Reviewer
export { reviewCompletionProof } from "./workflows/proof.workflow.js";
export type {
  ProofInput,
  ProofResult,
  ProofAiResult,
} from "./workflows/proof.workflow.js";

// A7 - Predefined Q&A
export { answerProjectQuestion } from "./workflows/qa.workflow.js";
export type {
  QaTopic,
  QaInput,
  QaResult,
  QaAiResult,
} from "./workflows/qa.workflow.js";

// Logging
export { InMemoryAiRunLogger } from "./logging/index.js";
export type {
  AiRunLogger,
  AiRunRecord,
} from "./logging/index.js";
