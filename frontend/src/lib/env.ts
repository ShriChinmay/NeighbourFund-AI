import { z } from "zod";

const envSchema = z.object({
  VITE_PAYPAL_CLIENT_ID: z.string().optional(),
  VITE_API_BASE_URL: z.string().optional(),
});

export const env = envSchema.parse(import.meta.env);