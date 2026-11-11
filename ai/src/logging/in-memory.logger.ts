
import type { AiRunLogger, AiRunRecord } from "./types.js";

export class InMemoryAiRunLogger implements AiRunLogger {
  private readonly records: AiRunRecord[] = [];

  async log(record: AiRunRecord): Promise<void> {
    this.records.push(record);
  }

  getRecords(): AiRunRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }
}
