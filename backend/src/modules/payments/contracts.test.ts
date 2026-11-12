import {describe,it,expect} from 'vitest';
import {createPaymentIntentSchema} from './contracts.js';
const valid={projectId:'00000000-0000-4000-8000-000000000101',kind:'resident',amountMinor:100,idempotencyKey:'unique_key_123456'};
describe('payment intent contracts',()=>{
 it('accepts a valid resident intent',()=>expect(createPaymentIntentSchema.safeParse(valid).success).toBe(true));
 it('rejects zero amounts',()=>expect(createPaymentIntentSchema.safeParse({...valid,amountMinor:0}).success).toBe(false));
 it('rejects unsafe integer amounts',()=>expect(createPaymentIntentSchema.safeParse({...valid,amountMinor:Number.MAX_SAFE_INTEGER+1}).success).toBe(false));
 it('rejects extra fields',()=>expect(createPaymentIntentSchema.safeParse({...valid,verified:true}).success).toBe(false));
 it('rejects short idempotency keys',()=>expect(createPaymentIntentSchema.safeParse({...valid,idempotencyKey:'short'}).success).toBe(false));
});
