import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function base64url(bytes:Uint8Array){
  let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"POST required"},405);
  const raw=await req.text();
  if(raw.length>4096)return json({error:"Payload too large"},413);
  const parsed=(()=>{try{return JSON.parse(raw)}catch{return {}}})();
  const property_id=parsed?.property_id;
  if(typeof property_id!=="string"||!/^[0-9a-f-]{36}$/i.test(property_id))return json({error:"Valid property_id required"},400);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const bearer=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!url||!serviceKey||!anonKey)return json({error:"Server credentials unavailable"},503);
  if(!bearer)return json({error:"Sign in first"},401);
  const auth=createClient(url,anonKey,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:authError}=await auth.auth.getUser();
  if(authError||!userData.user)return json({error:"Invalid session"},401);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:property,error}=await db.from("publisher_properties")
    .select("id,publisher_id,verified,property_type")
    .eq("id",property_id).maybeSingle();
  if(error||!property)return json({error:"Publisher property not found"},404);
  if(property.publisher_id!==userData.user.id)return json({error:"You do not own this publisher property"},403);
  if(!property.verified)return json({error:"Property must be verified before issuing a tracking key"},409);

  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const secret=base64url(bytes);
  const {error:saveError}=await db.from("publisher_tracking_secrets").upsert({
    property_id:property.id,publisher_id:property.publisher_id,secret_value:secret,
    rotated_at:new Date().toISOString(),revoked_at:null
  },{onConflict:"property_id"});
  if(saveError)return json({error:"Could not issue tracking key"},500);
  return json({
    success:true,
    property_id:property.id,
    tracking_secret:secret,
    shown_once:true,
    signing:"HMAC-SHA256(secret, timestamp + '.' + exact_request_body)",
    headers:["x-adbridge-timestamp","x-adbridge-signature"],
    warning:"Store this secret on your server only. Never put it in browser JavaScript or a public mobile app bundle. Rotating it invalidates the previous key."
  });
});
