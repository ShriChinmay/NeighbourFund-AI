
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

  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  DATABASE_URL: z.string().min(1).optional(),

  ATTESTATION_HMAC_SECRET: z
    .string()
    .min(32, "ATTESTATION_HMAC_SECRET must be at least 32 characters."),

  P4_DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const env = schema.parse(process.env);
