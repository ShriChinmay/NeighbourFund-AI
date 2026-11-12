import { z } from 'zod';

export const feasibilityFormSchema = z.object({
  households: z.number().int().min(1).max(100000),
  affordablePerHousehold: z.string(),
  sponsorCash: z.string(),
  inKind: z.string(),
  pool: z.string(),
});

const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
export function toMinor(value: string): number {
  if (!amountPattern.test(value)) throw new Error('Use a nonnegative USD amount with at most two decimals');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds the safe integer limit');
  return Number(cents);
}

export function parseFeasibilityForm(values: z.infer<typeof feasibilityFormSchema>) {
  const parsed = feasibilityFormSchema.parse(values);
  return {
    households: parsed.households,
    affordablePerHouseholdMinor: toMinor(parsed.affordablePerHousehold),
    sponsorCashMinor: toMinor(parsed.sponsorCash),
    inKindMinor: toMinor(parsed.inKind),
    poolMinor: toMinor(parsed.pool),
  };
}

export const feasibilityResponse = z.object({
  planId: z.string().uuid(),
  households: z.number().int(),
  verdict: z.enum(['needs_rescope', 'resident_fundable', 'needs_partners']),
  perHouseholdMinor: z.string(),
  residentRequiredMinor: z.string(),
  residentCapacityMinor: z.string(),
  gapMinor: z.string(),
  accepted: z.boolean(),
});
export type FeasibilityResult = z.infer<typeof feasibilityResponse>;
export const acceptanceResponse = z.object({
  accepted: z.literal(true),
  planId: z.string().uuid(),
  projectStatus: z.literal('funding'),
  slotIds: z.array(z.string().uuid()),
});
export const slotResponse = z.object({
  slots: z.array(z.object({
    id: z.string().uuid(),
    budgetId: z.string().uuid(),
    label: z.string(),
    amountMinor: z.string(),
    status: z.string(),
  })),
});
export const poolResponse = z.object({
  households: z.array(z.object({id: z.string().uuid(), participating: z.boolean(), coveredByPool: z.boolean()})),
  coveredCount: z.number(),
});
export const invitationResponse = z.object({
  invites: z.array(z.object({id: z.string().uuid(), token: z.string()})),
});
export function mayAcceptPlan(verdict: FeasibilityResult['verdict'], projectStatus: string, hasBudget: boolean) {
  return verdict !== 'needs_rescope' && ['draft', 'planning'].includes(projectStatus) && hasBudget;
}
