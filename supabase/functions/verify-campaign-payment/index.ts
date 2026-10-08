import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization")||"";const token=auth.replace(/^Bearer\s+/i,"");if(!token)return json({error:"Authentication required"},401);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);const {data:{user}}=await db.auth.getUser(token);if(!user)return json({error:"Authentication failed"},401);
 const {campaign_id,reference}=await req.json().catch(()=>({}));if(!campaign_id||!reference)return json({error:"campaign_id and reference are required"},400);
 const {data:c}=await db.from("campaigns").select("id,max_budget,advertiser_id,status").eq("id",campaign_id).eq("advertiser_id",user.id).single();if(!c)return json({error:"Campaign not found"},404);
 const secret=Deno.env.get("PAYSTACK_SECRET_KEY")||"";if(!secret)return json({error:"Paystack is not configured yet."},503);
 const r=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+secret}});const data=await r.json();if(!r.ok||data?.data?.status!=="success")return json({error:"Payment has not been confirmed by Paystack.",details:data},400);
 const paid=Number(data.data.amount||0)/100;
 if(paid < Number(c.max_budget||0))return json({error:"The confirmed payment is below the campaign budget."},400);
 const {data:payment}=await db.from("campaign_payments").select("id").eq("campaign_id",campaign_id).eq("type","funding").eq("provider_reference",reference).maybeSingle();
 if(payment)await db.from("campaign_payments").update({status:"held",amount:paid}).eq("id",payment.id);else await db.from("campaign_payments").insert({campaign_id,amount:paid,type:"funding",status:"held",provider:"paystack",provider_reference:reference});
 await db.from("campaigns").update({status:"funded",funded_amount:paid,updated_at:new Date().toISOString()}).eq("id",campaign_id);
 return json({success:true,status:"funded",amount:paid});
});