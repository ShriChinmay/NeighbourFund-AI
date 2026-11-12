import { describe,it,expect } from 'vitest';
import { validateJournal } from './service.js';

describe('ledger balance invariants',()=>{
  it('accepts balanced debit and credit',()=>expect(()=>validateJournal([
    {accountCode:'paypal_clearing',side:'debit',amountMinor:100n},
    {accountCode:'project_funds',side:'credit',amountMinor:100n},
  ])).not.toThrow());
  it('rejects unbalanced entries',()=>expect(()=>validateJournal([
    {accountCode:'paypal_clearing',side:'debit',amountMinor:100n},
    {accountCode:'project_funds',side:'credit',amountMinor:99n},
  ])).toThrow('balance'));
  it('rejects zero amounts',()=>expect(()=>validateJournal([
    {accountCode:'paypal_clearing',side:'debit',amountMinor:0n},
    {accountCode:'project_funds',side:'credit',amountMinor:0n},
  ])).toThrow('positive'));
});
