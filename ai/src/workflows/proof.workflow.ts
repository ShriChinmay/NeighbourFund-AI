import { randomUUID } from "node:crypto";

export interface ProofInput {
  items: {
    itemName: string;
    expectedCount: number;
    observedCount: number;
    matches: string[];
    cannotConfirm: string[];
  }[];
}

export interface ProofResult {
  items: ProofInput["items"];
  summary: string;
}

export type ProofAiResult =
  | {
      ok: true;
      data: ProofResult;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

export function reviewCompletionProof(
  input: ProofInput
): ProofAiResult {
  const runId = `fake-a6-${randomUUID()}`;

  if (!input || !Array.isArray(input.items)) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  for (const item of input.items) {
    if (
      !item ||
      typeof item.itemName !== "string" ||
      !item.itemName.trim() ||
      !Number.isSafeInteger(item.expectedCount) ||
      !Number.isSafeInteger(item.observedCount) ||
      item.expectedCount < 0 ||
      item.observedCount < 0 ||
      item.observedCount > item.expectedCount ||
      !Array.isArray(item.matches) ||
      !item.matches.every((value) => typeof value === "string") ||
      !Array.isArray(item.cannotConfirm) ||
      !item.cannotConfirm.every((value) => typeof value === "string")
    ) {
      return {
        ok: false,
        reason: "invalid_output",
        runId,
      };
    }
  }

  const uncertainItems = input.items
    .filter((item) => item.cannotConfirm.length > 0)
    .map((item) => item.itemName);

  const summary =
    uncertainItems.length > 0
      ? `Some completion details cannot be confirmed: ${uncertainItems.join(", ")}. Human review is required.`
      : "The submitted proof details match the supplied completion checklist. Human review is still required.";

  return {
    ok: true,
    data: {
      items: input.items,
      summary,
    },
    runId,
    validated: true,
  };
}