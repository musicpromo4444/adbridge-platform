"use client";

import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Placement={id:string;name:string;placement_key:string;description:string|null;enabled:boolean;format:string;provider:string|null;campaign_id:string|null;icon:string|null;action_url:string|null;frequency_cap:number;target_pages:string[];starts_at:string|null;ends_at:string|null};
const labels:Record<string,string>={direct_sponsor:"Sponsored",banner:"Sponsored",interstitial:"Sponsored",rewarded:"Reward",playable:"Play","offerwall/game":"Offers",link:"Sponsored"};

export default function AdPlacement({placementKey,className=""}:{placementKey:string;className?:string}){
 const [placement,setPlacement]=useState<Placement|null>(null);
 useEffect(()=>{let cancelled=false;async function load(){if(!supabase)return;const now=new Date().toISOString();const {data}=await supabase.from("ad_placements").select("id,name,placement_key,description,enabled,format,provider,campaign_id,icon,action_url,frequency_cap,target_pages,starts_at,ends_at").eq("placement_key",placementKey).eq("enabled",true).maybeSingle();if(cancelled||!data)return;if(data.starts_at&&data.starts_at>now)return;if(data.ends_at&&data.ends_at<now)return;setPlacement(data as Placement)}load();return()=>{cancelled=true}},[placementKey]);
 if(!placement)return null;
 const label=labels[placement.format]||"Sponsored";
 const clickable=!!placement.action_url;
 const body=<div className={className} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,.09)",borderRadius:16,background:"rgba(255,255,255,.035)",color:"inherit"}}>
   <span style={{fontSize:20}}>{placement.icon||"✦"}</span>
   <div style={{flex:1,minWidth:0}}><small style={{display:"block",opacity:.55,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>{label}</small><b style={{display:"block",marginTop:2}}>{placement.name}</b>{placement.description&&<p style={{margin:"3px 0 0",opacity:.65,fontSize:12}}>{placement.description}</p>}</div>
   {["rewarded","playable","offerwall/game"].includes(placement.format)&&<span style={{fontSize:12,fontWeight:700}}>{placement.format==="rewarded"?"Watch →":placement.format==="playable"?"Play →":"Open →"}</span>}
   {!["rewarded","playable","offerwall/game"].includes(placement.format)&&clickable&&<span style={{fontSize:12,fontWeight:700}}>View →</span>}
 </div>;
 return clickable?<a href={placement.action_url!} target="_blank" rel="noreferrer" style={{textDecoration:"none",color:"inherit"}}>{body}</a>:body;
}
