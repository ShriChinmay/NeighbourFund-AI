import { randomUUID } from "node:crypto";

export type QaTopic =
  | "funded_amount"
  | "open_slots"
  | "expenses_without_evidence"
  | "open_flags"
  | "tranche_status"
  | "household_attestations"
  | "solidarity_pool_balance";

export interface QaInput {
  question: string;
  topic: QaTopic;
  parameters?: Record<string, string>;
  backendData: unknown;
}

export interface QaResult {
  answer: string;
  recordReferences: string[];
  refused: boolean;
}

export type QaAiResult =
  | {
      ok: true;
      data: QaResult;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

const SUPPORTED_TOPICS: QaTopic[] = [
  "funded_amount",
  "open_slots",
  "expenses_without_evidence",
  "open_flags",
  "tranche_status",
  "household_attestations",
  "solidarity_pool_balance",
];

export function answerProjectQuestion(
  input: QaInput
): QaAiResult {
  const runId = `fake-a7-${randomUUID()}`;

  if (
    !input ||
    typeof input.question !== "string" ||
    !input.question.trim()
  ) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  if (!SUPPORTED_TOPICS.includes(input.topic)) {
    return {
      ok: true,
      data: {
        answer:
          "I cannot answer this question because it is outside the supported project topics.",
        recordReferences: [],
        refused: true,
      },
      runId,
      validated: true,
    };
  }

  if (
    !input.backendData ||
    typeof input.backendData !== "object" ||
    Array.isArray(input.backendData)
  ) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  const data = input.backendData as {
    answer?: unknown;
    recordReferences?: unknown;
  };

  if (
    typeof data.answer !== "string" ||
    !data.answer.trim() ||
    !Array.isArray(data.recordReferences) ||
    !data.recordReferences.every(
      (reference) =>
        typeof reference === "string" && reference.trim().length > 0
    )
  ) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  return {
    ok: true,
    data: {
      answer: data.answer,
      recordReferences: data.recordReferences,
      refused: false,
    },
    runId,
    validated: true,
  };
}
