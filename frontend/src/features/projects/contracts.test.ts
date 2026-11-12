import { describe, expect, it } from 'vitest';
import { budgetLineInput, cents, createProjectInput } from './contracts';
describe('money and project validation',()=>{
 it('converts decimal dollars without floating point multiplication',()=>{expect(cents('12.34')).toBe(1234);expect(cents('0.01')).toBe(1);});
 it('rejects unsafe amounts',()=>{expect(()=>cents('999999999999999999')).toThrow();});
 it('rejects malformed budget inputs',()=>{expect(budgetLineInput.safeParse({category:'A',description:'',dollars:'1.234'}).success).toBe(false);});
 it('validates project input',()=>{expect(createProjectInput.safeParse({communityName:'A',title:'B',description:'',goalDollars:'120.00'}).success).toBe(true);});
});
