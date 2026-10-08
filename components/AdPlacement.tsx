"use client";

import {useEffect,useState} from "react";import {usePathname} from "next/navigation";
import {supabase} from "@/lib/supabase";

type Placement={id:string;name:string;placement_key:string;description:string|null;enabled:boolean;format:string;provider:string|null;campaign_id:string|null;icon:string|null;action_url:string|null;frequency_cap:number;target_pages:string[];starts_at:string|null;ends_at:string|null};
const labels:Record<string,string>={direct_sponsor:"Sponsored",banner:"Sponsored",interstitial:"Sponsored",rewarded:"Reward",playable:"Play","offerwall/game":"Offers",link:"Sponsored"};

export default function AdPlacement({placementKey,className=""}:{placementKey?:string;className?:string}){ const path=usePathname();
 const [placement,setPlacement]=useState<Placement|null>(null);
 useEffect(()=>{let cancelled=false;async function load(){if(!supabase)return;const now=new Date().toISOString();const {data}=await supabase.from("ad_placements").select("id,name,placement_key,description,enabled,format,provider,campaign_id,icon,action_url,frequency_cap,target_pages,starts_at,ends_at").eq("enabled",true).order("created_at",{ascending:false});const found=(data||[]).find((x:any)=>{const pages=x.target_pages||[];return (!placementKey||x.placement_key===placementKey) && (!pages.length||pages.includes(path)||pages.includes("*")) && (!x.starts_at||x.starts_at<=now) && (!x.ends_at||x.ends_at>=now)});if(cancelled||!found)return;setPlacement(found as Placement);try{const visitorKey=localStorage.getItem("adbridge_visitor_id")||crypto.randomUUID();localStorage.setItem("adbridge_visitor_id",visitorKey);const sessionKey=sessionStorage.getItem("adbridge_session_id")||crypto.randomUUID();sessionStorage.setItem("adbridge_session_id",sessionKey);void supabase.functions.invoke("track-ad-event",{body:{placement_key:found.placement_key,event_type:"impression",visitor_key:visitorKey,session_id:sessionKey}})}catch{} }load();return()=>{cancelled=true}},[placementKey,path]);
 if(!placement)return null;
 const label=labels[placement.format]||"Sponsored";
 const clickable=!!placement.action_url;
 const body=<div className={className} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,.09)",borderRadius:16,background:"rgba(255,255,255,.035)",color:"inherit"}}>
   <span style={{fontSize:20}}>{placement.icon||"✦"}</span>
   <div style={{flex:1,minWidth:0}}><small style={{display:"block",opacity:.55,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>{label}</small><b style={{display:"block",marginTop:2}}>{placement.name}</b>{placement.description&&<p style={{margin:"3px 0 0",opacity:.65,fontSize:12}}>{placement.description}</p>}</div>
   {["rewarded","playable","offerwall/game"].includes(placement.format)&&<span style={{fontSize:12,fontWeight:700}}>{placement.format==="rewarded"?"Watch →":placement.format==="playable"?"Play →":"Open →"}</span>}
   {!["rewarded","playable","offerwall/game"].includes(placement.format)&&clickable&&<span style={{fontSize:12,fontWeight:700}}>View →</span>}
 </div>;
 const trackClick=()=>{try{const visitorKey=localStorage.getItem("adbridge_visitor_id");const sessionKey=sessionStorage.getItem("adbridge_session_id");if(visitorKey)void supabase?.functions.invoke("track-ad-event",{body:{placement_key:placement.placement_key,event_type:"click",visitor_key:visitorKey,session_id:sessionKey}})}catch{}}; return clickable?<a href={placement.action_url!} onClick={trackClick} target="_blank" rel="noreferrer" style={{textDecoration:"none",color:"inherit"}}>{body}</a>:body;
}
