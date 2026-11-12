import { describe, expect, it } from 'vitest';
import { mayAcceptPlan, parseFeasibilityForm, toMinor, feasibilityResponse } from './contracts';

const base = {households:48, affordablePerHousehold:'25.00', sponsorCash:'100.50', inKind:'0', pool:'12.30'};
describe('feasibility contracts', () => {
  it('converts decimal monetary values exactly to integer cents', () => {
    expect(parseFeasibilityForm(base)).toEqual({households:48,affordablePerHouseholdMinor:2500,sponsorCashMinor:10050,inKindMinor:0,poolMinor:1230});
  });
  it('rejects fractional cents, negative values and unsafe money', () => {
    expect(()=>toMinor('1.234')).toThrow();
    expect(()=>toMinor('-2.00')).toThrow();
    expect(()=>toMinor('999999999999999999')).toThrow();
  });
  it('enforces household boundaries', () => {
    expect(()=>parseFeasibilityForm({...base,households:0})).toThrow();
    expect(()=>parseFeasibilityForm({...base,households:100001})).toThrow();
  });
  it('does not present needs_rescope as acceptable', () => {
    expect(mayAcceptPlan('needs_rescope','draft',true)).toBe(false);
    expect(mayAcceptPlan('needs_partners','draft',true)).toBe(true);
    expect(mayAcceptPlan('resident_fundable','funding',true)).toBe(false);
    expect(mayAcceptPlan('resident_fundable','draft',false)).toBe(false);
  });
  it('validates actual feasibility response fields', () => {
    expect(feasibilityResponse.safeParse({planId:'11111111-1111-4111-8111-111111111111',households:12,verdict:'resident_fundable',perHouseholdMinor:'100',residentRequiredMinor:'1200',residentCapacityMinor:'1400',gapMinor:'0',accepted:false}).success).toBe(true);
  });
});
