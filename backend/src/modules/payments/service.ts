import type { PoolClient } from 'pg';
import { getPool } from '../../config/database.js';
import { createPaymentIntentSchema, type CreatePaymentIntent } from './contracts.js';

export class MoneyCoreError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

export type PaymentIntent = {
  id: string; projectId: string; payerUserId: string; slotId: string | null;
  kind: 'resident' | 'sponsor'; amountMinor: string; currency: 'USD'; status: string;
  createdAt: Date;
};

async function createInTransaction(client: PoolClient, input: CreatePaymentIntent, payerUserId: string): Promise<PaymentIntent> {
  // Serialize same payer requests; UNIQUE key also protects against concurrent duplicate inserts.
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [payerUserId]);
  const prior = await client.query<PaymentIntent>(`SELECT id, project_id AS "projectId",payer_user_id AS "payerUserId",
    slot_id AS "slotId",kind,amount_minor::text AS "amountMinor",currency,status,created_at AS "createdAt"
    FROM payment_intents WHERE payer_user_id=$1 AND idempotency_key=$2`, [payerUserId,input.idempotencyKey]);
  if (prior.rowCount) {
    const p = prior.rows[0]!;
    if (p.projectId !== input.projectId || p.kind !== input.kind || p.amountMinor !== String(input.amountMinor) || p.slotId !== (input.slotId ?? null)) {
      throw new MoneyCoreError('IDEMPOTENCY_CONFLICT',409,'Key was already used for different payment details');
    }
    return p;
  }
  const project = await client.query<{status:string}>(`SELECT status FROM projects WHERE id=$1`,[input.projectId]);
  if (!project.rowCount) throw new MoneyCoreError('PROJECT_NOT_FOUND',404,'Project not found');
  if (project.rows[0]!.status !== 'funding') throw new MoneyCoreError('PROJECT_NOT_FUNDING',409,'Project is not accepting funding');
  if (input.slotId) {
    const slot = await client.query<{status:string;amount_minor:string}>(`SELECT s.status,s.amount_minor::text
      FROM budget_slots s JOIN budgets b ON b.id=s.budget_id
      WHERE s.id=$1 AND b.project_id=$2`,[input.slotId,input.projectId]);
    if (!slot.rowCount || slot.rows[0]!.status !== 'open') throw new MoneyCoreError('SLOT_NOT_AVAILABLE',422,'Slot is unavailable');
    if (input.kind !== 'sponsor') throw new MoneyCoreError('INVALID_SLOT_KIND',422,'Only sponsor intents may select a slot');
    if (BigInt(input.amountMinor) > BigInt(slot.rows[0]!.amount_minor)) throw new MoneyCoreError('SLOT_AMOUNT_EXCEEDED',422,'Amount exceeds slot');
  }
  const result = await client.query<PaymentIntent>(`INSERT INTO payment_intents
    (project_id,payer_user_id,slot_id,kind,amount_minor,idempotency_key)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id,project_id AS "projectId",payer_user_id AS "payerUserId",
    slot_id AS "slotId",kind,amount_minor::text AS "amountMinor",currency,status,created_at AS "createdAt"`,
    [input.projectId,payerUserId,input.slotId??null,input.kind,String(input.amountMinor),input.idempotencyKey]);
  return result.rows[0]!;
}

// Intent creation is NOT a PayPal order, pledge, paid balance or verified transaction.
export async function createPaymentIntent(raw: unknown, payerUserId: string): Promise<PaymentIntent> {
  const parsed = createPaymentIntentSchema.safeParse(raw);
  if (!parsed.success) throw new MoneyCoreError('VALIDATION_ERROR',400,'Invalid payment intent');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const intent = await createInTransaction(client,parsed.data,payerUserId);
    await client.query('COMMIT');
    return intent;
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
}

export async function listPaymentIntents(payerUserId: string, projectId: string) {
  const result = await getPool().query<PaymentIntent>(`SELECT id,project_id AS "projectId",payer_user_id AS "payerUserId",
    slot_id AS "slotId",kind,amount_minor::text AS "amountMinor",currency,status,created_at AS "createdAt"
    FROM payment_intents WHERE payer_user_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 100`,
    [payerUserId,projectId]);
  return result.rows;
}
