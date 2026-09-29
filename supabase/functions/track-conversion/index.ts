import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async req => {
  if (req.method !== "POST") return Response.json({error:"POST required"},{status:405});
  const secret=Deno.env.get("CPA_POSTBACK_SECRET");
  if (!secret || req.headers.get("x-adbridge-secret")!==secret) return Response.json({error:"Unauthorized"},{status:401});
  const body=await req.json();
  const {campaign_id,creator_id,click_id,external_conversion_id,action_type="conversion",value=0}=body;
  if(!campaign_id||!external_conversion_id) return Response.json({error:"campaign_id and external_conversion_id required"},{status:400});
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:campaign,error:campaignError}=await db.from("campaigns").select("payment_method,payment_rate,max_budget,desired_results").eq("id",campaign_id).single();
  if(campaignError||!campaign||campaign.payment_method!=="actions") return Response.json({error:"Not an actions campaign"},{status:400});
  let resolvedCreator=creator_id||null;
  if(click_id){
    const {data:link}=await db.from("tracking_links").select("campaign_id,creator_id,submission_id").eq("slug",click_id).maybeSingle();
    if(link){
      if(link.campaign_id!==campaign_id) return Response.json({error:"Click does not belong to campaign"},{status:400});
      if(resolvedCreator && link.creator_id && resolvedCreator!==link.creator_id) return Response.json({error:"Creator does not match tracking link"},{status:400});
      resolvedCreator=resolvedCreator||link.creator_id||null;
    }
  }
  const {data:existing}=await db.from("cpa_conversion_events").select("id").eq("campaign_id",campaign_id).eq("external_conversion_id",external_conversion_id).maybeSingle();
  if(existing) return Response.json({ok:true,duplicate:true});
  const {count}=await db.from("cpa_conversion_events").select("id",{count:"exact",head:true}).eq("campaign_id",campaign_id).eq("status","approved");
  const target=Number(campaign.desired_results||0);
  if(target>0 && Number(count||0)>=target) return Response.json({error:"Campaign conversion target already reached"},{status:409});
  const {data:event,error}=await db.from("cpa_conversion_events").insert({campaign_id,creator_id:resolvedCreator,click_id,external_conversion_id,action_type,value,status:"approved"}).select("id").single();
  if(error) return Response.json({error:error.message},{status:500});
  const amount=Number(campaign.payment_rate||0);
  if(resolvedCreator && amount>0){
    const {data:paid}=await db.from("campaign_payments").select("amount").eq("campaign_id",campaign_id).eq("type","creator_payment").eq("status","released");
    const spent=(paid||[]).reduce((s:any,p:any)=>s+Number(p.amount||0),0);
    if(spent+amount<=Number(campaign.max_budget||0)){
      await db.from("campaign_payments").insert({campaign_id,creator_id:resolvedCreator,amount,type:"creator_payment",status:"released"});
    }
  }
  return Response.json({ok:true,event_id:event.id,conversions:Number(count||0)+1});
});