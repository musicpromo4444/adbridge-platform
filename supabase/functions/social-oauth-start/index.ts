import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function challenge(v:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}
function env(p:string,k:string){return Deno.env.get(`${p.toUpperCase()}_${k}`)||""}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const url=new URL(req.url); const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 if(req.method==="POST"){
  const {platform,creator_id}=await req.json().catch(()=>({}));
  if(!platform||!creator_id)return json({error:"platform and creator_id are required"},400);
  const p=String(platform).toLowerCase(); const allowed=["tiktok","youtube","instagram","facebook","x","snapchat"];
  if(!allowed.includes(p))return json({error:"Unsupported platform"},400);
  const base=Deno.env.get("APP_URL")||url.origin; const redirect=`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-oauth-start`;
  const state=b64(crypto.getRandomValues(new Uint8Array(24))); let verifier="";
  if(p==="x"){verifier=b64(crypto.getRandomValues(new Uint8Array(32)))}
  await supabase.from("social_oauth_states").insert({state,creator_id,platform:p,code_verifier:verifier||null,redirect_uri:redirect});
  let auth="";
  if(p==="tiktok"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"TikTok connection is not configured yet."},503);auth=`https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(id)}&response_type=code&scope=user.info.basic,video.list&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`}
  if(p==="youtube"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"YouTube connection is not configured yet."},503);auth=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent("https://www.googleapis.com/auth/youtube.readonly")}&access_type=offline&prompt=consent&state=${state}`}
  if(p==="instagram"||p==="facebook"){const id=env("meta","CLIENT_ID");if(!id)return json({error:"Meta connection is not configured yet."},503);auth=`https://www.facebook.com/v23.0/dialog/oauth?client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent("pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights")}&state=${state}`}
  if(p==="x"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"X connection is not configured yet."},503);auth=`https://x.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent("tweet.read users.read offline.access")}&state=${state}&code_challenge=${encodeURIComponent(await challenge(verifier))}&code_challenge_method=S256`}
  if(p==="snapchat"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"Snapchat connection is not configured yet."},503);auth=`https://accounts.snapchat.com/login/oauth2/authorize?client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent("snapchat-profile-api")}&state=${state}`}
  return json({url:auth});
 }
 const code=url.searchParams.get("code"),state=url.searchParams.get("state"),err=url.searchParams.get("error");
 if(!code||!state)return json({error:err||"OAuth callback requires code and state"},400);
 const {data:s}=await supabase.from("social_oauth_states").select("*").eq("state",state).gt("expires_at",new Date().toISOString()).single();
 if(!s)return json({error:"OAuth session expired or invalid"},400);
 const p=s.platform; const redirect=s.redirect_uri;
 let tokenUrl="",body:any={},headers:any={"Content-Type":"application/x-www-form-urlencoded"};
 if(p==="tiktok"){tokenUrl="https://open.tiktokapis.com/v2/oauth/token/";body={client_key:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
 if(p==="youtube"){tokenUrl="https://oauth2.googleapis.com/token";body={client_id:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
 if(p==="instagram"||p==="facebook"){tokenUrl="https://graph.facebook.com/v23.0/oauth/access_token";body={client_id:env("meta","CLIENT_ID"),client_secret:env("meta","CLIENT_SECRET"),code,redirect_uri:redirect}}
 if(p==="x"){tokenUrl="https://api.x.com/2/oauth2/token";body={client_id:env(p,"CLIENT_ID"),code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:s.code_verifier}}
 if(p==="snapchat"){tokenUrl="https://accounts.snapchat.com/login/oauth2/access_token";body={client_id:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
 if(!tokenUrl)return json({error:"Unsupported callback"},400);
 const form=new URLSearchParams(body); const tr=await fetch(tokenUrl,{method:"POST",headers,body:form}); const td=await tr.json();
 if(!tr.ok)return json({error:"Platform token exchange failed",details:td},502);
 const access=td.access_token; if(!access)return json({error:"Platform returned no access token"},502);
 await supabase.from("creator_platform_connections").upsert({creator_id:s.creator_id,platform:p,access_token:access,refresh_token:td.refresh_token||null,expires_at:td.expires_in?new Date(Date.now()+Number(td.expires_in)*1000).toISOString():null,connected:true,updated_at:new Date().toISOString()},{onConflict:"creator_id,platform"});
 await supabase.from("social_oauth_states").delete().eq("id",s.id);
 return Response.redirect(`${Deno.env.get("APP_URL")||"https://adbridge-platform.vercel.app"}/creator/connections?connected=${encodeURIComponent(p)}`,302);
});