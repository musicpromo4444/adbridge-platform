import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const b=await req.json().catch(()=>({}));const key=String(b.placement_key||"").trim(),type=String(b.event_type||""),visitor=String(b.visitor_key||"").trim();
 if(!key||!["impression","click"].includes(type)||visitor.length<8)return json({error:"placement_key, event_type and visitor_key are required"},400);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:p}=await db.from("ad_placements").select("id,action_url,frequency_cap").eq("placement_key",key).eq("enabled",true).maybeSingle();
 if(!p)return json({recorded:false});if(type==="click"&&!p.action_url)return json({recorded:false});
 if(type==="impression"&&Number(p.frequency_cap||0)>0){const since=new Date(Date.now()-86400000).toISOString();const {count}=await db.from("ad_placement_events").select("id",{count:"exact",head:true}).eq("placement_id",p.id).eq("event_type","impression").eq("visitor_key",visitor).gte("occurred_at",since);if(Number(count||0)>=Number(p.frequency_cap))return json({recorded:false,capped:true});}
 const country=req.headers.get("x-vercel-ip-country")||req.headers.get("cf-ipcountry")||null;
 const {error}=await db.from("ad_placement_events").insert({placement_id:p.id,event_type:type,visitor_key:visitor,session_id:b.session_id?String(b.session_id):null,country});
 if(error)return json({error:"Could not record ad event"},500);return json({recorded:true});
});