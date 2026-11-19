import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-adbridge-proxy-secret, x-adbridge-client-ip, x-adbridge-client-user-agent, x-adbridge-client-referrer",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function safeEqual(a:string,b:string){
  let mismatch=a.length^b.length;
  const n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++) mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return mismatch===0;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required"},405);
  const raw=await req.text();
  if(raw.length>8192) return json({error:"Payload too large"},413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw)}catch{return json({error:"Valid JSON required"},400)}
  const slug=String(body.slug||"").trim();
  const visitor=String(body.visitor_cookie||"").trim();
  const skipCount=body.skip_count===true;
  if(!/^c_[a-f0-9]{20}$/i.test(slug)) return json({error:"Tracking link not found"},404);
  if(visitor.length<8||visitor.length>128) return json({error:"Invalid visitor cookie"},400);

  const url=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey) return json({error:"Server tracking is not configured"},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const supplied=req.headers.get("x-adbridge-proxy-secret")||"";
  const {data:secretRow,error:secretError}=await db.from("adbridge_service_secrets")
    .select("secret_value").eq("key_name","tracking_proxy").maybeSingle();
  if(secretError||!secretRow?.secret_value||!safeEqual(supplied,String(secretRow.secret_value))){
    return json({error:"Unauthorized tracking proxy"},401);
  }

  const ip=req.headers.get("x-adbridge-client-ip")||"unknown";
  const ua=req.headers.get("x-adbridge-client-user-agent")||"";
  const referrer=req.headers.get("x-adbridge-client-referrer")||"";
  const visitorHash=await sha256(visitor+"|"+ip+"|"+ua+"|"+secretRow.secret_value);
  const ipHash=await sha256(ip+"|"+secretRow.secret_value);

  const result=skipCount
    ? await db.rpc("resolve_tracking_destination",{p_slug:slug})
    : await db.rpc("record_tracking_click",{
        p_slug:slug,p_visitor_key:visitorHash,p_ip_hash:ipHash,
        p_user_agent:ua,p_referrer:referrer,
      });
  if(result.error) return json({error:"Tracking event could not be processed"},500);
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  if(!row?.target_url) return json({error:"Tracking link not found"},404);
  return json({target_url:row.target_url,counted:row.counted??false,unique_counted:row.unique_counted??false});
});
