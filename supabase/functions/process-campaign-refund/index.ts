import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (v: unknown, status=200) => new Response(JSON.stringify(v), { status, headers });
Deno.serve(async (req: Request) => {
 if (req.method==="OPTIONS") return new Response("ok",{headers});
 if(req.method!=="POST") return json({error:"POST required"},405);
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 const url=Deno.env.get("SUPABASE_URL")||"", anon=Deno.env.get("SUPABASE_ANON_KEY")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"", secret=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
 if(!token||!url||!anon||!service||!secret) return json({error:"Refund service is not configured or authenticated"},503);
 const userDb=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authErr}=await userDb.auth.getUser(token);
 if(authErr||!auth.user) return json({error:"Authentication failed"},401);
 const {data:profile}=await createClient(url,service).from("profiles").select("role").eq("id",auth.user.id).maybeSingle();
 if(profile?.role!=="admin") return json({error:"Administrator access required"},403);
 let body: any; try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const refundId=String(body.refund_payment_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(refundId)) return json({error:"Valid refund_payment_id required"},400);
 const {data:attempts,error}=await userDb.rpc("admin_prepare_paystack_campaign_refund",{p_refund_payment_id:refundId});
 if(error) return json({error:error.message},400);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const outcomes=[];
 for(const a of attempts||[]){
   if(a.status==="processed"||a.status==="failed") {outcomes.push({id:a.id,status:a.status});continue;}
   await userDb.rpc("admin_update_paystack_refund_attempt",{p_attempt_id:a.id,p_status:"submitting"});
   const {data:funding}=await db.from("campaign_payments").select("provider_reference").eq("id",a.funding_payment_id).maybeSingle();
   if(!funding?.provider_reference){await userDb.rpc("admin_update_paystack_refund_attempt",{p_attempt_id:a.id,p_status:"manual_review",p_error:"Original Paystack transaction reference missing"});outcomes.push({id:a.id,status:"manual_review"});continue;}
   let response: Response;
   try{
     response=await fetch("https://api.paystack.co/refund",{method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json","Cache-Control":"no-cache"},body:JSON.stringify({transaction:funding.provider_reference,amount:Math.round(Number(a.amount)*100),currency:"NGN",reference:a.paystack_reference,merchant_note:"AdBridge campaign closure refund"})});
   }catch(e){
     // Keep the same Paystack refund reference on retry: Paystack enforces uniqueness.
     await userDb.rpc("admin_update_paystack_refund_attempt",{p_attempt_id:a.id,p_status:"manual_review",p_error:"Network result uncertain; reconcile this exact refund reference before retrying"});
     outcomes.push({id:a.id,status:"manual_review"});continue;
   }
   let result:any; try{result=await response.json()}catch{result={}}
   if(!response.ok||!result.status){
     const msg=String(result.message||"Paystack rejected refund request");
     const duplicate=/reference.*(used|exist|unique)/i.test(msg);
     await userDb.rpc("admin_update_paystack_refund_attempt",{p_attempt_id:a.id,p_status:duplicate?"manual_review":"failed",p_error:msg});
     outcomes.push({id:a.id,status:duplicate?"manual_review":"failed",message:msg});continue;
   }
   const providerStatus=String(result.data?.status||"pending").toLowerCase();
   const allowed=["pending","processing","needs-attention","processed","failed"].includes(providerStatus)?providerStatus:"pending";
   await userDb.rpc("admin_update_paystack_refund_attempt",{p_attempt_id:a.id,p_status:allowed,p_provider_refund_id:result.data?.id?String(result.data.id):null});
   outcomes.push({id:a.id,status:allowed});
 }
 return json({ok:true,attempts:outcomes});
});