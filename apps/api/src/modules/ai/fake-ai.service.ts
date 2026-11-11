
import { randomUUID } from "node:crypto";

import {
  BriefDraftSchema,
  type BriefDraft,
} from "@neighbourfund/contracts";

// Standard result format for all AI workflows (A1–A7)
export type AiResult<T> =
  | {
      ok: true;
      data: T;
      runId: string;
      validated: true;
    }
  | {
      ok: false;
      reason: "invalid_output" | "provider_error";
      runId: string;
    };

// A1: Brief Helper Input
export interface BriefInput {
  roughIdea: string;
  communityContext: string;
  goalMinor: number;
}

export class FakeAiService {
  async draftBrief(
    input: BriefInput
  ): Promise<AiResult<BriefDraft>> {
    // Generate a unique ID for every AI run
    const runId = `fake-a1-${randomUUID()}`;

    // Step 1: Validate input
    if (
      !input ||
      typeof input.roughIdea !== "string" ||
      typeof input.communityContext !== "string" ||
      !input.roughIdea.trim() ||
      !input.communityContext.trim() ||
      !Number.isSafeInteger(input.goalMinor) ||
      input.goalMinor < 0
    ) {
      return {
        ok: false,
        reason: "invalid_output",
        runId,
      };
    }

    // Step 2: Clean input strings
    const roughIdea = input.roughIdea.trim();
    const communityContext = input.communityContext.trim();

    // Step 3: Generate mock AI response
    const result = {
      summary: `Community project: ${roughIdea}. ${communityContext}`,
      milestones: [
        "Planning and preparation",
        "Project execution",
        "Completion and review",
      ],
      budgetLines: [
        {
          name: "Community project budget",
          amountMinor: input.goalMinor,
        },
      ],
    };

    // Step 4: Validate response using shared Zod schema
    const parsed = BriefDraftSchema.safeParse(result);

    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid_output",
        runId,
      };
    }

    // Step 5: Business validation
    // Total budget lines must exactly equal the requested goal
    const total = parsed.data.budgetLines.reduce(
      (sum, line) => sum + line.amountMinor,
      0
    );

    if (total !== input.goalMinor) {
      return {
        ok: false,
        reason: "invalid_output",
        runId,
      };
    }

    // Step 6: Return validated result
    return {
      ok: true,
      data: parsed.data,
      runId,
      validated: true,
    };
  }
}
