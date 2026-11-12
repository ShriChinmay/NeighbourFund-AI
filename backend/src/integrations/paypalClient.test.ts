import {describe,it,expect} from 'vitest';
import {cents,formatCents} from './paypalClient.js';
describe('PayPal exact money conversion',()=>{
 it('formats integer cents exactly',()=>expect(formatCents(123456789012345n)).toBe('1234567890123.45'));
 it('round trips without floating point',()=>expect(cents(formatCents(123456789012345n))).toBe(123456789012345n));
 it('rejects noncanonical provider amounts',()=>expect(()=>cents('1.234')).toThrow());
 it('rejects zero or negative order amounts',()=>expect(()=>formatCents(0n)).toThrow());
});
