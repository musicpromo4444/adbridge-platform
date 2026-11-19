"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Creator={display_name:string;verified_views:number;verified_clicks:number;verified_deliveries:number};
type Advertiser={display_name:string;budget_funded:number;campaign_count:number};
type Ranking={creators:Creator[];advertisers:Advertiser[];currency:string;updated_at:string};

export default function Rankings(){
 const[data,setData]=useState<Ranking|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let live=true;async function load(){if(!supabase){setError("Rankings are temporarily unavailable.");setLoading(false);return}const{data,error:e}=await supabase.rpc("get_adbridge_global_rankings");if(!live)return;if(e)setError("Global rankings could not be loaded. Please try again later.");else setData(data as Ranking);setLoading(false)}void load();return()=>{live=false}},[]);
 const money=(n:number)=>"₦"+Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:0});
 return <main className="formPage"><div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">WORLDWIDE LEADERBOARD</span><Link href="/signup" className="switch">Join AdBridge →</Link></div>
 <div className="formCard wide"><span className="eyebrow">GLOBAL PERFORMANCE</span><h1>The AdBridge <em>Top 20.</em></h1><p>Only the 20 strongest creators/publishers and 20 strongest advertisers/marketers worldwide are shown. Rankings use verified delivery and confirmed campaign funding, not follower counts.</p>
 {error&&<div className="successBox">{error}</div>}{loading&&<div className="successBox">Loading worldwide rankings…</div>}
 {!loading&&data&&<><div className="infoBox"><b>Creator & publisher ranking</b><p>Ranked using verified video views, verified clicks and verified ad delivery events. Unverified or flagged events are excluded.</p></div>
 <div className="opps">{data.creators.map((r,i)=><article key={i}><div className="choiceRow"><b>#{i+1} · {r.display_name||"AdBridge Publisher"}</b><strong>{Number(r.verified_views).toLocaleString()} views</strong></div><p>{Number(r.verified_clicks).toLocaleString()} verified clicks · {Number(r.verified_deliveries).toLocaleString()} verified deliveries</p></article>)}{!data.creators.length&&<div className="successBox">No verified creator or publisher performance has been recorded yet.</div>}</div>
 <div className="infoBox"><b>Advertiser & marketer ranking</b><p>Ranked by confirmed campaign budget funded through AdBridge, with campaign count as the secondary measure.</p></div>
 <div className="opps">{data.advertisers.map((r,i)=><article key={i}><div className="choiceRow"><b>#{i+1} · {r.display_name||"AdBridge Advertiser"}</b><strong>{money(r.budget_funded)}</strong></div><p>{Number(r.campaign_count).toLocaleString()} campaigns funded</p></article>)}{!data.advertisers.length&&<div className="successBox">No advertiser campaign funding has been recorded yet.</div>}</div>
 <small>Last refreshed: {new Date(data.updated_at).toLocaleString()}</small></>}
 </div></main>
}
