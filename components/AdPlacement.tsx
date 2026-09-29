"use client";

import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Placement={
 id:string;
 name:string;
 placement_key:string;
 description:string|null;
 enabled:boolean;
 format:string;
 provider:string|null;
 campaign_id:string|null;
 icon:string|null;
 action_url:string|null;
 frequency_cap:number;
 target_pages:string[];
 starts_at:string|null;
 ends_at:string|null;
};

const labels:Record<string,string>={
 direct_sponsor:"Sponsored",
 banner:"Sponsored",
 interstitial:"Sponsored",
 rewarded:"Reward",
 playable:"Play",
 "offerwall/game":"Offers",
 link:"Sponsored"
};

export default function AdPlacement({placementKey,className=""}:{placementKey:string;className?:string}){
 const [placement,setPlacement]=useState<Placement|null>(null);
 useEffect(()=>{
   let cancelled=false;
   async function load(){
     if(!supabase)return;
     const now=new Date().toISOString();
     const {data}=await supabase.from("ad_placements")
       .select("id,name,placement_key,description,enabled,format,provider,campaign_id,icon,action_url,frequency_cap,target_pages,starts_at,ends_at")
       .eq("placement_key",placementKey).eq("enabled",true).maybeSingle();
     if(cancelled||!data)return;
     if(data.starts_at&&data.starts_at>now)return;
     if(data.ends_at&&data.ends_at<now)return;
     setPlacement(data as Placement);
   }
   load();
   return()=>{cancelled=true};
 },[placementKey]);

 if(!placement)return null;
 const label=labels[placement.format]||"Sponsored";
 const clickable=!!placement.action_url;
 const body=<div className={"adPlacement "+className}>
   <span className="adIcon">{placement.icon||"✦"}</span>
   <div className="adCopy"><small>{label}</small><b>{placement.name}</b>{placement.description&&<p>{placement.description}</p>}</div>
   {placement.format==="rewarded"&&<span className="adAction">Watch →</span>}
   {placement.format==="playable"&&<span className="adAction">Play →</span>}
   {placement.format==="offerwall/game"&&<span className="adAction">Open →</span>}
   {!["rewarded","playable","offerwall/game"].includes(placement.format)&&clickable&&<span className="adAction">View →</span>}
 </div>;
 return clickable?<a href={placement.action_url!} target="_blank" rel="noreferrer">{body}</a>:body;
}
