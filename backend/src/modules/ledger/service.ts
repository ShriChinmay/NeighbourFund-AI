import type { PoolClient } from 'pg';

export type LedgerLine = { accountCode: 'paypal_clearing'|'project_funds'|'refunds'|'disbursements'; side:'debit'|'credit'; amountMinor:bigint };
export type JournalSource = 'paypal_capture'|'paypal_refund'|'payout'|'adjustment';

export function validateJournal(lines: readonly LedgerLine[]): void {
  if (lines.length < 2 || lines.some(l=>l.amountMinor<=0n)) throw new Error('Journal requires at least two positive entries');
  const debits=lines.filter(l=>l.side==='debit').reduce((a,l)=>a+l.amountMinor,0n);
  const credits=lines.filter(l=>l.side==='credit').reduce((a,l)=>a+l.amountMinor,0n);
  if (debits===0n || debits!==credits) throw new Error('Journal must balance');
}

/** Internal-only: caller must BEGIN/COMMIT transaction and verify provider event BEFORE calling.
 * Never expose this function through an unauthenticated HTTP endpoint. */
export async function postJournal(client:PoolClient, input:{projectId:string;sourceType:JournalSource;sourceId:string;description?:string;lines:readonly LedgerLine[]}):Promise<string>{
  validateJournal(input.lines);
  const existing=await client.query<{id:string;project_id:string}>(`SELECT id,project_id FROM ledger_journals WHERE source_type=$1 AND source_id=$2`,[input.sourceType,input.sourceId]);
  if(existing.rowCount) {
    if(existing.rows[0]!.project_id!==input.projectId) throw new Error('Journal source already belongs to another project');
    return existing.rows[0]!.id;
  }
  const journal=await client.query<{id:string}>(`INSERT INTO ledger_journals(project_id,source_type,source_id,description)
    VALUES($1,$2,$3,$4) RETURNING id`,[input.projectId,input.sourceType,input.sourceId,input.description??'']);
  const id=journal.rows[0]!.id;
  for(const line of input.lines){
    const account=await client.query<{id:string}>(`INSERT INTO ledger_accounts(project_id,code)
      VALUES($1,$2) ON CONFLICT(project_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`,[input.projectId,line.accountCode]);
    await client.query(`INSERT INTO ledger_entries(journal_id,project_id,account_id,side,amount_minor)
      VALUES($1,$2,$3,$4,$5)`,[id,input.projectId,account.rows[0]!.id,line.side,line.amountMinor.toString()]);
  }
  return id;
}
