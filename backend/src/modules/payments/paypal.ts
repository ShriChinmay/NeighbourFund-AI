import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../config/database.js';
import { requireRoles } from '../platform/auth/session.js';
import { paypalClient, cents } from '../../integrations/paypalClient.js';
import { postJournal } from '../ledger/service.js';
import type { PoolClient } from 'pg';
export const paypalRouter=Router();
const uuid=z.string().uuid();
const fail=(res:import('express').Response,status:number,code:string)=>res.status(status).json({error:{code}});
type Intent={id:string;project_id:string;payer_user_id:string;status:string;amount_minor:string;provider_order_id:string|null;provider_capture_id:string|null};
type VerifiedCapture={id:string;orderId:string;amountMinor:bigint};

async function persistCaptureInTransaction(
  client: PoolClient,
  capture: VerifiedCapture
): Promise<void> {
  const r = await client.query<Intent>(
    `SELECT id, project_id, payer_user_id, status,
            amount_minor::text, provider_order_id, provider_capture_id
     FROM payment_intents
     WHERE provider_order_id = $1
     FOR UPDATE`,
    [capture.orderId]
  );

  if (!r.rowCount) {
    throw new Error('No local intent for provider order');
  }

  const p = r.rows[0]!;

  if (
    p.provider_order_id !== capture.orderId ||
    BigInt(p.amount_minor) !== capture.amountMinor
  ) {
    throw new Error('Capture amount/order mismatch');
  }

  if (p.status === 'captured') {
    if (p.provider_capture_id !== capture.id) {
      throw new Error('Conflicting capture on already captured intent');
    }
    return;
  }

  if (p.status !== 'pending') {
    throw new Error('Intent is not pending');
  }

  await client.query(
    `UPDATE payment_intents
     SET status = 'captured', provider_capture_id = $1
     WHERE id = $2`,
    [capture.id, p.id]
  );

  await postJournal(client, {
    projectId: p.project_id,
    sourceType: 'paypal_capture',
    sourceId: capture.id,
    description: `PayPal capture for intent ${p.id}`,
    lines: [
      {
        accountCode: 'paypal_clearing',
        side: 'debit',
        amountMinor: capture.amountMinor
      },
      {
        accountCode: 'project_funds',
        side: 'credit',
        amountMinor: capture.amountMinor
      }
    ]
  });
}

async function persistCapture(capture: VerifiedCapture): Promise<void> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    await persistCaptureInTransaction(client, capture);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

paypalRouter.post('/payment-intents/:id/paypal-order',requireRoles('resident','sponsor'),async(req,res,next)=>{
 if(!uuid.safeParse(req.params.id).success)return fail(res,400,'INVALID_ID');
 try{
  const r=await getPool().query<Intent>(`SELECT id,project_id,payer_user_id,status,amount_minor::text,provider_order_id,provider_capture_id FROM payment_intents WHERE id=$1 AND payer_user_id=$2`,[req.params.id,req.auth!.id]);
  if(!r.rowCount)return fail(res,404,'INTENT_NOT_FOUND');
  const p=r.rows[0]!;
  if(!['created','pending'].includes(p.status))return fail(res,409,'INVALID_STATE');
  if(p.provider_order_id){
   const order=await paypalClient.getOrder(p.provider_order_id);
   return res.json({orderId:order.id,approvalUrl:order.links?.find(l=>l.rel==='payer-action'||l.rel==='approve')?.href??null});
  }
  // Stable PayPal-Request-Id makes retries safe if the first response is lost.
  const createdOrder = await paypalClient.createOrder(
  p.id,
  BigInt(p.amount_minor)
);

if (!['CREATED', 'PAYER_ACTION_REQUIRED'].includes(createdOrder.status)) {
  throw new Error('Unexpected PayPal order state');
}

// PayPal's create-order response may omit purchase-unit details.
// Retrieve the authoritative order representation before validating.
const order = await paypalClient.getOrder(createdOrder.id);

if (
  order.id !== createdOrder.id ||
  !['CREATED', 'PAYER_ACTION_REQUIRED'].includes(order.status) ||
  order.purchase_units?.length !== 1 ||
  order.purchase_units[0]?.reference_id !== p.id ||
  order.purchase_units[0]?.amount.currency_code !== 'USD' ||
  cents(order.purchase_units[0].amount.value) !== BigInt(p.amount_minor)
) {
  throw new Error('PayPal order mismatch');
}
  const updated=await getPool().query(`UPDATE payment_intents SET provider_order_id=$1,status='pending' WHERE id=$2 AND status='created' AND provider_order_id IS NULL RETURNING id`,[order.id,p.id]);
  if(!updated.rowCount){
   const latest=await getPool().query<{provider_order_id:string|null}>(`SELECT provider_order_id FROM payment_intents WHERE id=$1`,[p.id]);
   if(latest.rows[0]?.provider_order_id!==order.id)throw new Error('Concurrent order creation conflict; manual reconciliation required');
  }
  res.status(201).json({orderId:order.id,approvalUrl:order.links?.find(l=>l.rel==='payer-action'||l.rel==='approve')?.href??null});
 }catch(e){next(e);}
});

paypalRouter.post('/payment-intents/:id/capture',requireRoles('resident','sponsor'),async(req,res,next)=>{
 if(!uuid.safeParse(req.params.id).success)return fail(res,400,'INVALID_ID');
 try{
  const r=await getPool().query<Intent>(`SELECT id,project_id,payer_user_id,status,amount_minor::text,provider_order_id,provider_capture_id FROM payment_intents WHERE id=$1 AND payer_user_id=$2`,[req.params.id,req.auth!.id]);
  if(!r.rowCount)return fail(res,404,'INTENT_NOT_FOUND');
  const p=r.rows[0]!;
  if(p.status==='captured')return res.json({status:'captured',captureId:p.provider_capture_id});
  if(p.status!=='pending'||!p.provider_order_id)return fail(res,409,'INVALID_STATE');
  // A completed capture may already exist after a network failure; query the order first.
  let result=await paypalClient.getOrder(p.provider_order_id);
  // Verify the PayPal order belongs to this payment intent
// before attempting any new capture.
if (
  result.id !== p.provider_order_id ||
  result.purchase_units?.length !== 1 ||
  result.purchase_units[0]?.reference_id !== p.id ||
  result.purchase_units[0]?.amount.currency_code !== 'USD' ||
  cents(result.purchase_units[0].amount.value) !== BigInt(p.amount_minor)
) {
  throw new Error('PayPal order verification failed before capture');
}
  // Order GET may include captures, but its schema is intentionally permissive.
  // Use capture response when order is approved and no capture is known locally.
  const raw=result as unknown as {purchase_units?:Array<{payments?:{captures?:Array<{id:string;status:string;amount:{currency_code:string;value:string}}>}}>};
  let captures=raw.purchase_units?.flatMap(u=>u.payments?.captures??[])??[];
  if(captures.length===0){
   const response=await paypalClient.captureOrder(p.provider_order_id,`capture-${p.id}`);
   result=response as unknown as typeof result;
   captures=response.purchase_units?.flatMap(u=>u.payments.captures)??[];
  }
  if(result.status!=='COMPLETED'||captures.length!==1||captures[0]!.status!=='COMPLETED'||captures[0]!.amount.currency_code!=='USD'||cents(captures[0]!.amount.value)!==BigInt(p.amount_minor))throw new Error('PayPal capture verification failed');
  // Confirm the capture belongs to the original provider order.
  const order=await paypalClient.getOrder(p.provider_order_id);
  const orderRaw=order as unknown as {purchase_units?:Array<{payments?:{captures?:Array<{id:string}>}}>};
  if(order.id!==p.provider_order_id || order.status!=='COMPLETED'||!orderRaw.purchase_units?.some(u=>u.payments?.captures?.some(c=>c.id===captures[0]!.id)))throw new Error('PayPal capture/order association failed');
  await persistCapture({id:captures[0]!.id,orderId:p.provider_order_id,amountMinor:BigInt(p.amount_minor)});
  res.json({status:'captured',captureId:captures[0]!.id});
 }catch(e){next(e);}
});

const eventSchema=z.object({id:z.string().min(1),event_type:z.string().min(1),resource:z.unknown()}).passthrough();
// Register BEFORE express.json() only if raw body is required by a future verification strategy.
// PayPal verify-webhook-signature accepts parsed webhook_event and PayPal transmission headers.

paypalRouter.post('/paypal/webhook', async (req, res, next) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'INVALID_EVENT');

    const verified = await paypalClient.verifyWebhook(
      req.headers as Record<string, string | undefined>,
      parsed.data
    );
    if (!verified) return fail(res, 401, 'INVALID_SIGNATURE');

    const event = parsed.data;
    const sha = createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex');

    // Verify with PayPal before opening a database transaction.
    let captureToPersist: VerifiedCapture | null = null;

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = z.object({
        id: z.string().min(1),
        status: z.literal('COMPLETED'),
        amount: z.object({
          currency_code: z.literal('USD'),
          value: z.string()
        }),
        supplementary_data: z.object({
          related_ids: z.object({
            order_id: z.string().min(1)
          })
        })
      }).safeParse(event.resource);

      if (!resource.success) {
        return fail(res, 422, 'CAPTURE_RESOURCE_INCOMPLETE');
      }

      const capture = await paypalClient.getCapture(resource.data.id);

      if (
        capture.status !== 'COMPLETED' ||
        capture.amount.currency_code !== 'USD' ||
        cents(capture.amount.value) !== cents(resource.data.amount.value)
      ) {
        throw new Error('Capture does not match PayPal API');
      }

      const order = await paypalClient.getOrder(
        resource.data.supplementary_data.related_ids.order_id
      );

      if (
        order.id !== resource.data.supplementary_data.related_ids.order_id ||
        order.status !== 'COMPLETED' ||
        order.purchase_units?.length !== 1 ||
        !order.purchase_units[0]?.payments?.captures?.some(
          c => c.id === capture.id
        )
      ) {
        throw new Error('Capture not associated with order');
      }

      captureToPersist = {
        id: capture.id,
        orderId: order.id,
        amountMinor: cents(capture.amount.value)
      };
    }

    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      // The unique constraint on (provider, provider_event_id)
      // serializes concurrent deliveries of the same event.
      const inserted = await client.query<{
        id: string;
        payload_sha256: string;
        event_type: string;
        processing_status: string;
      }>(
        `INSERT INTO payment_provider_events
           (provider, provider_event_id, event_type,
            payload_sha256, verification_status)
         VALUES ('paypal', $1, $2, $3, 'verified')
         ON CONFLICT (provider, provider_event_id)
         DO UPDATE SET provider_event_id = EXCLUDED.provider_event_id
         RETURNING id, payload_sha256, event_type, processing_status`,
        [event.id, event.event_type, sha]
      );

      const row = inserted.rows[0]!;

      if (row.payload_sha256 !== sha || row.event_type !== event.event_type) {
        await client.query('ROLLBACK');
        return fail(res, 409, 'EVENT_ID_COLLISION');
      }

      if (row.processing_status === 'processed') {
        await client.query('COMMIT');
        return res.json({ ok: true, duplicate: true });
      }

      if (captureToPersist) {
        await persistCaptureInTransaction(client, captureToPersist);
      }

      await client.query(
        `UPDATE payment_provider_events
         SET processing_status = 'processed',
             processed_at = now()
         WHERE id = $1`,
        [row.id]
      );

      await client.query('COMMIT');
      return res.json({ ok: true });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});
