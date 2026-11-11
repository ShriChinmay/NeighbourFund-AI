
import { InMemoryAiRunLogger } from "./in-memory.logger.js";

export type { AiRunLogger, AiRunRecord } from "./types.js";

export { InMemoryAiRunLogger } from "./in-memory.logger.js";

// Temporary default logger.
// Later, backend integration will replace this with database logging.
export const defaultAiRunLogger = new InMemoryAiRunLogger();
