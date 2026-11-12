import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../platform/auth/session.js';
import { createPaymentIntent, listPaymentIntents, MoneyCoreError } from './service.js';

export const paymentIntentRouter = Router();
const uuid = z.string().uuid();
const fail = (res: import('express').Response,status:number,code:string,message:string) =>
  res.status(status).json({error:{code,message}});

// Only a non-paying, non-reserving intent is created in Batch 1.
paymentIntentRouter.post('/payment-intents',requireRoles('resident','sponsor'),async(req,res,next)=>{
  if (req.auth?.role !== req.body?.kind) return fail(res,403,'ROLE_MISMATCH','Payment kind must match the signed-in role');
  try { const intent = await createPaymentIntent(req.body,req.auth!.id); res.status(201).json({intent,checkoutAvailable:false}); }
  catch(e) { if(e instanceof MoneyCoreError) return fail(res,e.status,e.code,e.message); next(e); }
});
paymentIntentRouter.get('/projects/:id/payment-intents/mine',requireRoles('resident','sponsor'),async(req,res,next)=>{
  if(!uuid.safeParse(req.params.id).success) return fail(res,400,'VALIDATION_ERROR','Invalid project ID');
  try { res.json({intents:await listPaymentIntents(req.auth!.id,req.params.id as string)}); }
  catch(e){next(e);}
});
