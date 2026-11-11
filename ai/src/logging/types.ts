
export interface AiRunRecord {
  id: string;
  workflow: string;
  promptVersion: string;
  model: string;
  inputHash: string;
  output: unknown | null;
  validated: boolean;
  latencyMs: number;
  createdAt: string;
}

export interface AiRunLogger {
  log(record: AiRunRecord): Promise<void>;
}
