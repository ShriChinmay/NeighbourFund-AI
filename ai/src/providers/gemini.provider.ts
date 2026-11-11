
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AiProvider } from "./types.js";

const DEFAULT_MODEL = "gemini-3.6-flash";

export class GeminiAiProvider implements AiProvider {
  readonly providerName = "gemini";
  readonly modelName: string;
  private readonly client: GoogleGenAI;

  constructor() {
    const envPaths = [
      resolve(process.cwd(), "ai", ".env"),
      resolve(process.cwd(), ".env"),
    ];

    const envPath = envPaths.find((path) => existsSync(path));

    if (envPath) {
      process.loadEnvFile(envPath);
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    this.modelName =
      process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

    this.client = new GoogleGenAI({ apiKey });
  }

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

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: input.userPrompt,
      config: {
        systemInstruction: input.systemPrompt,
        responseMimeType: "application/json",
      },
    });

    const generatedText = response.text;

    if (!generatedText?.trim()) {
      throw new Error("Gemini returned an empty response");
    }

    return generatedText;
  }
}
