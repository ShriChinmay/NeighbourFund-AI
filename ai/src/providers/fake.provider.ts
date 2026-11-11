
import type { AiProvider } from "./types.js";

export class FakeAiProvider implements AiProvider {
  readonly providerName = "fake";
  readonly modelName = "deterministic-fake";

  async generateText(input: {
    systemPrompt: string;
    userPrompt: string;
    workflow: string;
  }): Promise<string> {
    if (!input.systemPrompt.trim()) {
      throw new Error("System prompt cannot be empty");
    }

    if (!input.userPrompt.trim()) {
      throw new Error("User prompt cannot be empty");
    }

    if (input.workflow === "brief") {
      let briefInput: {
        roughIdea: string;
        communityContext: string;
        goalMinor: number;
      };

      try {
        briefInput = JSON.parse(input.userPrompt);
      } catch {
        return JSON.stringify({
          message: "Fake AI provider response",
          workflow: input.workflow,
          mode: "fake",
        });
      }

      if (
        typeof briefInput.roughIdea !== "string" ||
        typeof briefInput.communityContext !== "string" ||
        !Number.isSafeInteger(briefInput.goalMinor) ||
        briefInput.goalMinor < 0
      ) {
        throw new Error("Invalid brief input");
      }

      return JSON.stringify({
        summary: `Community project: ${briefInput.roughIdea}. ${briefInput.communityContext}`,
        milestones: [
          "Planning and preparation",
          "Project execution",
          "Completion and review",
        ],
        budgetLines: [
          {
            name: "Community project budget",
            amountMinor: briefInput.goalMinor,
          },
        ],
      });
    }

    return JSON.stringify({
      message: "Fake AI provider response",
      workflow: input.workflow,
      mode: "fake",
    });
  }
}
