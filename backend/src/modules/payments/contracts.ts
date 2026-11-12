import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const minorAmountSchema = z.number().int().positive().safe();
export const createPaymentIntentSchema = z.object({
  projectId: uuidSchema,
  kind: z.enum(['resident', 'sponsor']),
  amountMinor: minorAmountSchema,
  slotId: uuidSchema.optional(),
  idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();
export type CreatePaymentIntent = z.infer<typeof createPaymentIntentSchema>;
export type PaymentStatus = 'created' | 'pending' | 'captured' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
