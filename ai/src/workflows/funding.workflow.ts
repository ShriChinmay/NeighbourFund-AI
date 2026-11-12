
import { randomUUID } from "node:crypto";

export interface FundingInput {
  goalMinor: number;
  lines: {
    sourceType: string;
    amountMinor: number;
    rationale: string;
    risks: string[];
  }[];
}

export interface FundingResult {
  lines: FundingInput["lines"];
}

export type FundingAiResult =
  | {
      ok: true;
      data: FundingResult;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

export function planFundingMix(
  input: FundingInput
): FundingAiResult {
  const runId = `fake-a4-${randomUUID()}`;

  // Validate the overall input.
  if (
    !input ||
    !Number.isSafeInteger(input.goalMinor) ||
    input.goalMinor < 0 ||
    !Array.isArray(input.lines) ||
    input.lines.length === 0
  ) {
    return { ok: false, reason: "invalid_output", runId };
  }

  // Validate each funding source.
  for (const line of input.lines) {
    if (
      !line ||
      typeof line.sourceType !== "string" ||
      !line.sourceType.trim() ||
      !Number.isSafeInteger(line.amountMinor) ||
      line.amountMinor < 0 ||
      typeof line.rationale !== "string" ||
      !line.rationale.trim() ||
      !Array.isArray(line.risks) ||
      !line.risks.every((risk) => typeof risk === "string")
    ) {
      return { ok: false, reason: "invalid_output", runId };
    }
  }

  // All contributions, including in-kind, count toward the funding goal,
  // matching the P3 backend's current funding calculation.
  const total = input.lines.reduce(
    (sum, line) => sum + line.amountMinor,
    0
  );

  // Reject unsafe totals and funding that does not match the goal.
  if (
    !Number.isSafeInteger(total) ||
    total !== input.goalMinor
  ) {
    return { ok: false, reason: "invalid_output", runId };
  }

  return {
    ok: true,
    data: { lines: input.lines },
    runId,
    validated: true,
  };
}
