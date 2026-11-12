import { z } from 'zod';

const BASE = 'https://api-m.sandbox.paypal.com';
const tokenSchema = z.object({access_token:z.string().min(1)});
const linkSchema = z.object({rel:z.string(),href:z.string().url()});
const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  links: z.array(linkSchema).optional(),
  purchase_units: z.array(
    z.object({
      reference_id: z.string().optional(),
      custom_id: z.string().optional(),
      amount: z.object({
        currency_code: z.string(),
        value: z.string()
      }),
      payments: z.object({
        captures: z.array(
          z.object({
            id: z.string().min(1),
            status: z.string(),
            amount: z.object({
              currency_code: z.string(),
              value: z.string()
            })
          }).passthrough()
        ).optional()
      }).passthrough().optional()
    }).passthrough()
  ).optional()
}).passthrough();const captureSchema = z.object({id:z.string(),status:z.string(),purchase_units:z.array(z.object({reference_id:z.string().optional(),custom_id:z.string().optional(),payments:z.object({captures:z.array(z.object({id:z.string(),status:z.string(),amount:z.object({currency_code:z.string(),value:z.string()}),custom_id:z.string().optional()}).passthrough())})})).optional()}).passthrough();
export type PaypalOrder = z.infer<typeof orderSchema>;
export type PaypalCapture = z.infer<typeof captureSchema>;
function credentials(){
 const id=process.env.PAYPAL_CLIENT_ID, secret=process.env.PAYPAL_CLIENT_SECRET;
 if(process.env.PAYPAL_ENV!=='sandbox' || !id || !secret) throw new Error('PayPal Sandbox not configured');
 return {id,secret};
}
async function accessToken(){
 const {id,secret}=credentials();
 const res=await fetch(`${BASE}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(12000)});
 if(!res.ok) throw new Error(`PayPal OAuth HTTP ${res.status}`);
 return tokenSchema.parse(await res.json()).access_token;
}
async function api(path:string,method:'GET'|'POST',body?:unknown,requestId?:string){
 const token=await accessToken();
 const res=await fetch(`${BASE}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!res.ok) throw new Error(`PayPal ${method} ${path} HTTP ${res.status}`);
 return res.json() as Promise<unknown>;
}
export function formatCents(amount:bigint):string {if(amount<=0n)throw new Error('Invalid amount');return `${amount/100n}.${(amount%100n).toString().padStart(2,'0')}`;}
export function cents(value:string):bigint {if(!/^(0|[1-9]\d*)\.\d{2}$/.test(value))throw new Error('Invalid PayPal money value');return BigInt(value.replace('.',''));}
export const paypalClient={
 createOrder:async(id:string,amountMinor:bigint)=>orderSchema.parse(await api('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{reference_id:id,custom_id:id,amount:{currency_code:'USD',value:formatCents(amountMinor)}}]},id)),
 getOrder:async(id:string)=>orderSchema.parse(await api(`/v2/checkout/orders/${encodeURIComponent(id)}`,'GET')),
 captureOrder:async(id:string,requestId:string)=>captureSchema.parse(await api(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`,'POST',{},requestId)),
 getCapture:async(id:string)=>z.object({id:z.string(),status:z.string(),amount:z.object({currency_code:z.string(),value:z.string()}),supplementary_data:z.unknown().optional()}).passthrough().parse(await api(`/v2/payments/captures/${encodeURIComponent(id)}`,'GET')),
 verifyWebhook:async(headers:Record<string,string|undefined>,event:unknown)=>{
  const webhookId=process.env.PAYPAL_WEBHOOK_ID;
  if(!webhookId)throw new Error('PAYPAL_WEBHOOK_ID not configured');
  const fields=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'] as const;
  if(fields.some(k=>!headers[k]))throw new Error('Missing PayPal webhook headers');
  const result=z.object({verification_status:z.enum(['SUCCESS','FAILURE'])}).parse(await api('/v1/notifications/verify-webhook-signature','POST',{
   auth_algo:headers['paypal-auth-algo'],cert_url:headers['paypal-cert-url'],transmission_id:headers['paypal-transmission-id'],transmission_sig:headers['paypal-transmission-sig'],transmission_time:headers['paypal-transmission-time'],webhook_id:webhookId,webhook_event:event
  }));
  return result.verification_status==='SUCCESS';
 }
};
