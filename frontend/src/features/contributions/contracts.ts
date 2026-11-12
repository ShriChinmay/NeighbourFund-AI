import { z } from 'zod';
import { toMinor } from '../funding/contracts';

export const contributionForm = z.object({
  amount: z.string(),
  kind: z.enum(['resident','sponsor']),
  slotId: z.string().uuid().optional(),
});
export type ContributionForm = z.infer<typeof contributionForm>;
export function validateContribution(input: ContributionForm, projectStatus: string, slotIds: string[]) {
  const data=contributionForm.parse(input);
  if (projectStatus !== 'funding') throw new Error('This project is not accepting contributions');
  const amountMinor=toMinor(data.amount);
  if (amountMinor <= 0) throw new Error('Contribution amount must be positive');
  if (data.kind==='sponsor' && (!data.slotId || !slotIds.includes(data.slotId))) throw new Error('Choose an available funding slot');
  if (data.kind==='resident' && data.slotId) throw new Error('Resident contributions must not select a sponsor slot');
  return {amountMinor,kind:data.kind,...(data.slotId?{slotId:data.slotId}:{})};
}
export type PaymentState='not_connected'|'pending'|'paid'|'failed'|'cancelled'|'verified';
export type PaymentCapability={enabled:boolean;provider:'paypal'|null;reason:string};
// This adapter deliberately never invents checkout endpoints, transaction IDs, or payment outcomes.
export const paymentCapability:PaymentCapability={enabled:false,provider:null,reason:'Payment checkout and verification endpoints have not been merged into this backend.'};
