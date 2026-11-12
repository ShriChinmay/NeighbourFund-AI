import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the root .env file relative to this module.
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Preserve the existing P4 server default.
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  DATABASE_URL: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
