import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Cache-Control":"no-store"}});
function safeHttpUrl(value:unknown){
 if(typeof value!=="string"||!value.trim())return null;
 try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password?u.toString():null}catch{return null}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="GET")return json({error:"GET required"},405);
 const url=new URL(req.url),propertyId=(url.searchParams.get("property_id")||"").trim(),platform=(url.searchParams.get("platform")||"").trim(),format=(url.searchParams.get("format")||"").trim();
 if(!propertyId||!platform||!format)return json({error:"property_id, platform and format are required"},400);
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!serviceKey)return json({error:"Delivery service is not configured"},503);
 const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:property,error:propertyError}=await db.from("publisher_properties").select("id,publisher_id,verified,platforms,ad_formats").eq("id",propertyId).maybeSingle();
 if(propertyError)return json({error:"Property lookup failed"},500);
 if(!property||!property.verified)return json({ads:[],reason:"property_not_verified"});
 if(!(property.platforms||[]).includes(platform)||!(property.ad_formats||[]).includes(format))return json({ads:[],reason:"format_not_registered"});
 const {data:placements,error}=await db.from("ad_placements").select("id,placement_key,name,format,campaign_id,action_url,creative_asset_url,description,frequency_cap,publisher_application_id,starts_at,ends_at").eq("enabled",true).eq("publisher_id",property.publisher_id).eq("publisher_property_id",propertyId).eq("format",format).not("publisher_application_id","is",null).limit(10);
 if(error)return json({error:"Placement query failed"},500);
 const ads=[];
 for(const p of placements||[]){
  const {data:application}=await db.from("publisher_campaigns").select("id,status,selected_platform,selected_format").eq("id",p.publisher_application_id).eq("publisher_id",property.publisher_id).eq("campaign_id",p.campaign_id).eq("selected_property_id",propertyId).eq("status","approved").maybeSingle();
  if(!application||application.selected_platform!==platform||application.selected_format!==format)continue;
  const {data:campaign}=await db.from("campaigns").select("id,status").eq("id",p.campaign_id).in("status",["funded","active"]).maybeSingle();
  if(!campaign)continue;
  ads.push({placement_id:p.id,placement_key:p.placement_key,campaign_id:p.campaign_id,name:p.name,format:p.format,creative_url:safeHttpUrl(p.creative_asset_url),destination_url:safeHttpUrl(p.action_url),description:p.description,frequency_cap:p.frequency_cap});
 }
 return json({ads,property_id:propertyId,platform,format});
});
