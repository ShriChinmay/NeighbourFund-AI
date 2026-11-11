
import { randomUUID } from "node:crypto";

import {
  BriefDraftSchema,
  type BriefDraft,
} from "@neighbourfund/contracts";

import {
  BRIEF_PROMPT_VERSION,
  BRIEF_SYSTEM_PROMPT,
} from "../prompts/index.js";

import { getAiProvider } from "../providers/index.js";
import type { AiProvider } from "../providers/types.js";

import { defaultAiRunLogger } from "../logging/index.js";
import type { AiRunLogger } from "../logging/types.js";

import { hashAiInput } from "../logging/hash.js";

export interface BriefInput {
  roughIdea: string;
  communityContext: string;
  goalMinor: number;
}

export type AiResult<T> =
  | {
      ok: true;
      data: T;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error" | "logging_error";
      runId: string;
    };

export async function draftBrief(
  input: BriefInput,
  provider: AiProvider = getAiProvider(),
  logger: AiRunLogger = defaultAiRunLogger
): Promise<AiResult<BriefDraft>> {
  const runId = `a1-${randomUUID()}`;
  const startTime = Date.now();

  const inputHash = hashAiInput(
    JSON.stringify(input) ?? "undefined"
  );

  let finalOutput: unknown = null;
  let validated = false;

  // Logging failure must never crash the workflow.
  async function logRun(): Promise<boolean> {
    try {
      await logger.log({
        id: runId,
        workflow: "brief",
        promptVersion: BRIEF_PROMPT_VERSION,
        model: provider.modelName ?? provider.providerName ?? "unknown",
        inputHash,
        output: finalOutput,
        validated,
        latencyMs: Date.now() - startTime,
        createdAt: new Date().toISOString(),
      });

      return true;
    } catch {
      return false;
    }
  }

  if (
    !input ||
    typeof input.roughIdea !== "string" ||
    typeof input.communityContext !== "string" ||
    !input.roughIdea.trim() ||
    !input.communityContext.trim() ||
    !Number.isSafeInteger(input.goalMinor) ||
    input.goalMinor < 0
  ) {
    const logged = await logRun();

    return {
      ok: false,
      reason: logged ? "invalid_output" : "logging_error",
      runId,
    };
  }

  const userPrompt = JSON.stringify({
    roughIdea: input.roughIdea.trim(),
    communityContext: input.communityContext.trim(),
    goalMinor: input.goalMinor,
    requiredOutput: {
      summary: "string",
      milestones: ["string"],
      budgetLines: [
        {
          name: "string",
          amountMinor: "non-negative safe integer",
        },
      ],
    },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let rawOutput: string;

    try {
      rawOutput = await provider.generateText({
        systemPrompt:
          attempt === 0
            ? BRIEF_SYSTEM_PROMPT
            : `${BRIEF_SYSTEM_PROMPT}

Your previous output was invalid. Return only valid JSON matching the required schema. Ensure all budget amounts are safe non-negative integers and their sum equals the goal.`,
        userPrompt,
        workflow: "brief",
      });
    } catch {
      finalOutput = {
        error: "provider_error",
      };

      const logged = await logRun();

      return {
        ok: false,
        reason: logged ? "provider_error" : "logging_error",
        runId,
      };
    }

    finalOutput = rawOutput;

    let output: unknown;

    try {
      output = JSON.parse(rawOutput);
    } catch {
      continue;
    }

    const parsed = BriefDraftSchema.safeParse(output);

    if (!parsed.success) {
      continue;
    }

    const amountsAreSafe = parsed.data.budgetLines.every(
      (line) => Number.isSafeInteger(line.amountMinor)
    );

    if (!amountsAreSafe) {
      continue;
    }

    const total = parsed.data.budgetLines.reduce(
      (sum, line) => sum + line.amountMinor,
      0
    );

    if (
      !Number.isSafeInteger(total) ||
      total !== input.goalMinor
    ) {
      continue;
    }

    finalOutput = parsed.data;
    validated = true;

    const logged = await logRun();

    if (!logged) {
      return {
        ok: false,
        reason: "logging_error",
        runId,
      };
    }

    return {
      ok: true,
      data: parsed.data,
      runId,
      validated: true,
    };
  }

  const logged = await logRun();

  return {
    ok: false,
    reason: logged ? "invalid_output" : "logging_error",
    runId,
  };
}
