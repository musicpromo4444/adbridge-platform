import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function challenge(v:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}
function env(p:string,k:string){return Deno.env.get(p.toUpperCase()+"_"+k)||""}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 if(req.method==="POST"){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return json({error:"Authentication required"},401);
  const {data:{user},error:ue}=await supabase.auth.getUser(token);if(ue||!user)return json({error:"Authentication failed"},401);
  const {platform}=await req.json().catch(()=>({}));const p=String(platform||"").toLowerCase();const allowed=["tiktok","youtube","instagram","facebook","x","snapchat"];if(!allowed.includes(p))return json({error:"Unsupported platform"},400);
  const base=Deno.env.get("APP_URL")||"";if(!base)return json({error:"APP_URL is not configured."},503);
  const redirect= Deno.env.get("SUPABASE_URL")+"/functions/v1/social-oauth-start";const state=b64(crypto.getRandomValues(new Uint8Array(24)));let verifier="";
  if(p==="x")verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
  const {error:se}=await supabase.from("social_oauth_states").insert({state,creator_id:user.id,platform:p,code_verifier:verifier||null,redirect_uri:redirect});if(se)return json({error:"Could not start the connection."},500);
  let auth="";
  if(p==="tiktok"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"TikTok connection is not configured yet."},503);auth="https://www.tiktok.com/v2/auth/authorize/?client_key="+encodeURIComponent(id)+"&response_type=code&scope="+encodeURIComponent("user.info.basic,video.list")+"&redirect_uri="+encodeURIComponent(redirect)+"&state="+state}
  if(p==="youtube"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"YouTube connection is not configured yet."},503);auth="https://accounts.google.com/o/oauth2/v2/auth?client_id="+encodeURIComponent(id)+"&redirect_uri="+encodeURIComponent(redirect)+"&response_type=code&scope="+encodeURIComponent("https://www.googleapis.com/auth/youtube.readonly")+"&access_type=offline&prompt=consent&state="+state}
  if(p==="instagram"||p==="facebook"){const id=env("meta","CLIENT_ID");if(!id)return json({error:"Meta connection is not configured yet."},503);auth="https://www.facebook.com/v23.0/dialog/oauth?client_id="+encodeURIComponent(id)+"&redirect_uri="+encodeURIComponent(redirect)+"&response_type=code&scope="+encodeURIComponent("pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights")+"&state="+state}
  if(p==="x"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"X connection is not configured yet."},503);auth="https://x.com/i/oauth2/authorize?response_type=code&client_id="+encodeURIComponent(id)+"&redirect_uri="+encodeURIComponent(redirect)+"&scope="+encodeURIComponent("tweet.read users.read offline.access")+"&state="+state+"&code_challenge="+encodeURIComponent(await challenge(verifier))+"&code_challenge_method=S256"}
  if(p==="snapchat"){const id=env(p,"CLIENT_ID");if(!id)return json({error:"Snapchat connection is not configured yet."},503);auth="https://accounts.snapchat.com/login/oauth2/authorize?client_id="+encodeURIComponent(id)+"&redirect_uri="+encodeURIComponent(redirect)+"&response_type=code&scope="+encodeURIComponent("snapchat-profile-api")+"&state="+state}
  return json({url:auth});
 }
 if(req.method==="GET"){
  const url=new URL(req.url);const code=url.searchParams.get("code"),state=url.searchParams.get("state"),err=url.searchParams.get("error");if(!code||!state)return json({error:err||"OAuth callback requires code and state"},400);
  const {data:s}=await supabase.from("social_oauth_states").select("*").eq("state",state).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return json({error:"OAuth session expired or invalid"},400);
  const p=s.platform,redirect=s.redirect_uri;let tokenUrl="",body:any={};
  if(p==="tiktok"){tokenUrl="https://open.tiktokapis.com/v2/oauth/token/";body={client_key:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
  if(p==="youtube"){tokenUrl="https://oauth2.googleapis.com/token";body={client_id:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
  if(p==="instagram"||p==="facebook"){tokenUrl="https://graph.facebook.com/v23.0/oauth/access_token";body={client_id:env("meta","CLIENT_ID"),client_secret:env("meta","CLIENT_SECRET"),code,redirect_uri:redirect}}
  if(p==="x"){tokenUrl="https://api.x.com/2/oauth2/token";body={client_id:env(p,"CLIENT_ID"),code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:s.code_verifier}}
  if(p==="snapchat"){tokenUrl="https://accounts.snapchat.com/login/oauth2/access_token";body={client_id:env(p,"CLIENT_ID"),client_secret:env(p,"CLIENT_SECRET"),code,grant_type:"authorization_code",redirect_uri:redirect}}
  if(!tokenUrl)return json({error:"Unsupported callback"},400);
  const tr=await fetch(tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)});const td=await tr.json();if(!tr.ok)return json({error:"Platform token exchange failed",details:td},502);if(!td.access_token)return json({error:"Platform returned no access token"},502);
  let platformUserId:string|null=null;
  const identityHeaders={Authorization:"Bearer "+td.access_token};
  if(p==="youtube"){
    const ir=await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",{headers:identityHeaders});
    const identity=await ir.json();platformUserId=identity?.items?.[0]?.id||null;
  }else if(p==="tiktok"){
    const ir=await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",{headers:identityHeaders});
    const identity=await ir.json();platformUserId=identity?.data?.user?.open_id||null;
  }else if(p==="x"){
    const ir=await fetch("https://api.x.com/2/users/me",{headers:identityHeaders});
    const identity=await ir.json();platformUserId=identity?.data?.id||null;
  }else if(p==="instagram"||p==="facebook"){
    const ir=await fetch("https://graph.facebook.com/v23.0/me?fields=id",{headers:identityHeaders});
    const identity=await ir.json();platformUserId=identity?.id||null;
  }
  if(p!=="snapchat"&&!platformUserId)return json({error:"The platform did not return your authenticated account ID. Reconnect and try again."},502);
  const {error:ue}=await supabase.from("creator_platform_connections").upsert({creator_id:s.creator_id,platform:p,platform_user_id:platformUserId,access_token:td.access_token,refresh_token:td.refresh_token||null,expires_at:td.expires_in?new Date(Date.now()+Number(td.expires_in)*1000).toISOString():null,connected:true,updated_at:new Date().toISOString()},{onConflict:"creator_id,platform"});if(ue)return json({error:"Connection could not be saved."},500);
  await supabase.from("social_oauth_states").delete().eq("id",s.id);return Response.redirect((Deno.env.get("APP_URL")||"")+"/creator/connections?connected="+encodeURIComponent(p),302);
 }
 return json({error:"Method not allowed"},405);
});