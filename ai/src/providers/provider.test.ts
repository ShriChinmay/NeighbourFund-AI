import { afterEach, describe, expect, it } from "vitest";
import { FakeAiProvider } from "./fake.provider.js";
import { getAiProvider } from "./index.js";

describe("FakeAiProvider", () => {
  it("should return a predictable fake response", async () => {
    const provider = new FakeAiProvider();

    const result = await provider.generateText({
      systemPrompt: "You are a helpful assistant",
      userPrompt: "Create a project brief",
      workflow: "brief",
    });

    const parsed = JSON.parse(result);

    expect(parsed.message).toBe("Fake AI provider response");
    expect(parsed.workflow).toBe("brief");
    expect(parsed.mode).toBe("fake");
  });

  it("should reject an empty system prompt", async () => {
    const provider = new FakeAiProvider();

    await expect(
      provider.generateText({
        systemPrompt: " ",
        userPrompt: "Test",
        workflow: "brief",
      })
    ).rejects.toThrow("System prompt cannot be empty");
  });

  it("should reject an empty user prompt", async () => {
    const provider = new FakeAiProvider();

    await expect(
      provider.generateText({
        systemPrompt: "System",
        userPrompt: " ",
        workflow: "brief",
      })
    ).rejects.toThrow("User prompt cannot be empty");
  });
});

describe("getAiProvider", () => {
  const originalMode = process.env.AI_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.AI_MODE;
    } else {
      process.env.AI_MODE = originalMode;
    }
  });

  it("should return FakeAiProvider by default", () => {
    delete process.env.AI_MODE;

    expect(getAiProvider()).toBeInstanceOf(FakeAiProvider);
  });

  it("should return FakeAiProvider when AI_MODE is fake", () => {
    process.env.AI_MODE = "fake";

    expect(getAiProvider()).toBeInstanceOf(FakeAiProvider);
  });

  it("should reject unsupported provider modes", () => {
    process.env.AI_MODE = "openai";

    expect(() => getAiProvider()).toThrow(
      "Unsupported AI_MODE: openai"
    );
  });
});