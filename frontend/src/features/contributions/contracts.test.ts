import { describe,expect,it } from 'vitest';
import { validateContribution,paymentCapability } from './contracts';
const slot='00000000-0000-4000-8000-000000000001';
describe('contribution boundary',()=>{
 it('converts valid resident amount to minor units',()=>{expect(validateContribution({amount:'12.34',kind:'resident'},'funding',[]).amountMinor).toBe(1234);});
 it('requires a project in funding stage',()=>{expect(()=>validateContribution({amount:'5.00',kind:'resident'},'draft',[])).toThrow();});
 it('rejects zero or malformed amounts',()=>{expect(()=>validateContribution({amount:'0.00',kind:'resident'},'funding',[])).toThrow();expect(()=>validateContribution({amount:'1.234',kind:'resident'},'funding',[])).toThrow();});
 it('requires a valid sponsor slot',()=>{expect(()=>validateContribution({amount:'1.00',kind:'sponsor'},'funding',[slot])).toThrow();expect(validateContribution({amount:'1.00',kind:'sponsor',slotId:slot},'funding',[slot]).slotId).toBe(slot);});
 it('never claims checkout is active without a backend integration',()=>{expect(paymentCapability.enabled).toBe(false);expect(paymentCapability.provider).toBeNull();});
});
