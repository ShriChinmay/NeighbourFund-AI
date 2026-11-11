
import type { AiProvider } from "./types.js";
import { FakeAiProvider } from "./fake.provider.js";
import { GeminiAiProvider } from "./gemini.provider.js";

export function getAiProvider(): AiProvider {
  const mode = process.env.AI_MODE ?? "fake";

  if (mode === "fake") {
    return new FakeAiProvider();
  }

  if (mode === "gemini") {
    return new GeminiAiProvider();
  }

  throw new Error(`Unsupported AI_MODE: ${mode}`);
}
