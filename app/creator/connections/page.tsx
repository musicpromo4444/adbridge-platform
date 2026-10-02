"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

const platforms=[
 {id:"tiktok",name:"TikTok",desc:"Connect your TikTok account so AdBridge can verify campaign video metrics.",color:"TikTok"},
 {id:"youtube",name:"YouTube",desc:"Connect your channel for verified video view tracking.",color:"YouTube"},
 {id:"instagram",name:"Instagram",desc:"Connect a professional Instagram account for eligible insights.",color:"Instagram"},
 {id:"facebook",name:"Facebook",desc:"Connect your Page/creator account for eligible video insights.",color:"Facebook"},
 {id:"x",name:"X",desc:"Connect X to verify eligible post view counts.",color:"X"},
 {id:"snapchat",name:"Snapchat",desc:"Connect your Public Profile for eligible Spotlight/Story insights.",color:"Snapchat"},
];

export default function Connections(){
 const [connections,setConnections]=useState<any[]>([]);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const load=async()=>{
  if(!supabase)return; const {data:{user}}=await supabase.auth.getUser(); const id=user?.id; if(!id)return;
  const {data}=await supabase.from("creator_platform_connections").select("platform,connected,updated_at").eq("creator_id",id);
  setConnections(data||[]);
 };
 useEffect(()=>{load()},[]);
 async function connect(platform:string){
  const {data:{user}}=await supabase!.auth.getUser(); const creator=user?.id; if(!creator||!supabase){setMessage("Open your creator profile first.");return}
  setBusy(platform);setMessage("");
  const {data,error}=await supabase.functions.invoke("social-oauth-start",{body:{platform,creator_id:creator}});
  if(error||!data?.url){setMessage(error?.message||data?.error||"This connection is not configured yet.");setBusy("");return}
  window.location.href=data.url;
 }
 async function disconnect(platform:string){
  const {data:{user}}=await supabase.auth.getUser(); const creator=user?.id;if(!creator||!supabase)return;
  setBusy(platform);await supabase.from("creator_platform_connections").update({connected:false,updated_at:new Date().toISOString()}).eq("creator_id",creator).eq("platform",platform);await load();setBusy("");
 }
 return <main className="formPage"><Link href="/creator/profile" className="back">← Creator Profile</Link><div className="formCard wide"><span className="eyebrow">SOCIAL CONNECTIONS</span><h1>Connect your <em>accounts.</em></h1><p>Connected accounts let AdBridge verify campaign results directly from supported platforms instead of relying on creator-entered numbers.</p>
 {message&&<div className="successBox">{message}</div>}
 <div className="statsGrid">{platforms.map(x=>{const c=connections.find(v=>v.platform===x.id&&v.connected);return <div key={x.id} className="quick"><h2>{x.name}</h2><p>{x.desc}</p><strong>{c?"Connected ✓":"Not connected"}</strong><br/>{c?<button className="secondary" disabled={busy===x.id} onClick={()=>disconnect(x.id)}>{busy===x.id?"Working…":"Disconnect"}</button>:<button className="primary" disabled={busy===x.id} onClick={()=>connect(x.id)}>{busy===x.id?"Opening…":"Connect "+x.name}</button>}</div>})}</div>
 <div className="successBox"><b>Privacy:</b> AdBridge only uses connected platform access for the features you authorize. Tokens are stored server-side and are not displayed to advertisers.</div>
 </div></main>
}