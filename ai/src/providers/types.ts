
export interface AiProvider {
  readonly providerName?: string;
  readonly modelName?: string;

  generateText(input: {
    systemPrompt: string;
    userPrompt: string;
    workflow: string;
  }): Promise<string>;
}
