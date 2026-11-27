import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function toHex(b:Uint8Array){return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function signature(secret:string,body:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);return toHex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body))));}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"POST required"},405);
 const secret=Deno.env.get("PAYSTACK_SECRET_KEY")||"",url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!secret||!url||!service)return json({error:"Webhook is not configured"},503);
 const raw=await req.text();if(raw.length>1000000)return json({error:"Payload too large"},413);
 const supplied=(req.headers.get("x-paystack-signature")||"").trim().toLowerCase();
 if(!supplied||!safeEqual(supplied,await signature(secret,raw)))return json({error:"Invalid webhook signature"},401);
 let event:any;try{event=JSON.parse(raw)}catch{return json({error:"Invalid JSON payload"},400)}
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(["refund.pending","refund.processing","refund.needs-attention","refund.failed","refund.processed"].includes(event.event)){
   const d=event.data||{};
   if(String(d.currency||"").toUpperCase()!=="NGN")return json({received:true,ignored:true,reason:"unsupported_refund_currency"});
   const reference=String(d.reference||d.refund_reference||"").trim();
   const transactionReference=String(d.transaction_reference||"").trim();
   const status=String(d.status||event.event.replace("refund.","")).toLowerCase();
   const mapped=status==="needs_attention"?"needs-attention":status;
   const providerRefundId=d.id?String(d.id):null;
   if(reference){
     const {data,error}=await db.rpc("paystack_reconcile_refund_webhook",{p_reference:reference,p_status:mapped,p_provider_refund_id:providerRefundId});
     if(error)return json({error:"Refund reconciliation failed"},500);
     if(data?.matched)return json({received:true,...data});
   }
   // Paystack's refund.pending example can contain a null refund_reference.
   // Fall back to the original transaction reference plus exact amount; the
   // database only reconciles when exactly one active allocation matches.
   const amountKobo=Number(d.amount);
   if(!transactionReference||!Number.isSafeInteger(amountKobo)||amountKobo<=0)return json({received:true,ignored:true,reason:"refund_reference_and_match_fields_missing"});
   const {data,error}=await db.rpc("paystack_reconcile_refund_webhook_by_transaction",{p_transaction_reference:transactionReference,p_amount_kobo:amountKobo,p_status:mapped,p_provider_refund_id:providerRefundId});
   if(error)return json({error:"Refund fallback reconciliation failed"},500);
   return json({received:true,...data});
 }
 if(event.event!=="charge.success")return json({received:true,ignored:true});
 const data=event.data||{},reference=String(data.reference||"").trim();
 if(!reference||String(data.status||"").toLowerCase()!=="success")return json({received:true,ignored:true});
 if(String(data.currency||"").toUpperCase()!=="NGN")return json({received:true,ignored:true,reason:"unsupported_currency"});
 const amount=Number(data.amount)/100;if(!Number.isFinite(amount)||amount<=0)return json({received:true,ignored:true,reason:"invalid_amount"});
 const {data:payment,error:paymentError}=await db.from("campaign_payments").select("campaign_id,status,provider").eq("provider","paystack").eq("provider_reference",reference).eq("type","funding").maybeSingle();
 if(paymentError)return json({error:"Payment lookup failed"},500);
 if(!payment)return json({received:true,ignored:true,reason:"unknown_reference"});
 if(!["pending","held"].includes(payment.status))return json({received:true,ignored:true,reason:"payment_not_pending"});
 const {data:confirmation,error:confirmationError}=await db.rpc("confirm_campaign_funding",{p_campaign_id:payment.campaign_id,p_provider_reference:reference,p_paid_amount:amount});
 if(confirmationError){if(confirmationError.code==="22023"||confirmationError.code==="55000")return json({received:true,confirmed:false,manual_review:true});return json({error:"Funding confirmation failed"},500);}
 return json({received:true,confirmed:true,...confirmation});
});