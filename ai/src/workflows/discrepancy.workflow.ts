
import { randomUUID } from "node:crypto";

export interface DiscrepancyInput {
  budgetedAmountMinor: number;
  actualAmountMinor: number;
  budgetLineName: string;
}

export interface DiscrepancyResult {
  flagType: "within_budget" | "over_budget" | "under_budget";
  differenceMinor: number;
  explanation: string;
}

export type DiscrepancyAiResult =
  | {
      ok: true;
      data: DiscrepancyResult;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

export function explainDiscrepancy(
  input: DiscrepancyInput
): DiscrepancyAiResult {
  const runId = `fake-a3-${randomUUID()}`;

  if (
    !input ||
    typeof input.budgetLineName !== "string" ||
    !input.budgetLineName.trim() ||
    !Number.isSafeInteger(input.budgetedAmountMinor) ||
    !Number.isSafeInteger(input.actualAmountMinor) ||
    input.budgetedAmountMinor < 0 ||
    input.actualAmountMinor < 0
  ) {
    return {
      ok: false,
      reason: "invalid_output",
      runId,
    };
  }

  // Calculate the difference in code, never through AI.
  const differenceMinor =
    input.actualAmountMinor - input.budgetedAmountMinor;

  let flagType: DiscrepancyResult["flagType"];

  if (differenceMinor > 0) {
    flagType = "over_budget";
  } else if (differenceMinor < 0) {
    flagType = "under_budget";
  } else {
    flagType = "within_budget";
  }

  const amount = Math.abs(differenceMinor);

  const explanation =
    differenceMinor > 0
      ? `The actual expense for ${input.budgetLineName.trim()} is ${amount} minor units above the approved budget.`
      : differenceMinor < 0
        ? `The actual expense for ${input.budgetLineName.trim()} is ${amount} minor units below the approved budget.`
        : `The actual expense for ${input.budgetLineName.trim()} matches the approved budget.`;

  return {
    ok: true,
    data: {
      flagType,
      differenceMinor,
      explanation,
    },
    runId,
    validated: true,
  };
}
