"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import AdPlacement from "@/components/AdPlacement";

type Campaign={id:string;name:string;goal:string;platform:string|null;status:string;max_budget:number|null;desired_results:number|null};

export default function Advertiser(){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{async function load(){if(!supabase){setLoading(false);return}const {data}=await supabase.from("campaigns").select("id,name,goal,platform,status,max_budget,desired_results").order("created_at",{ascending:false});setCampaigns(data??[]);setLoading(false)}load()},[]);
 const active=campaigns.filter(c=>c.status==="active");
 const totalBudget=campaigns.reduce((sum,c)=>sum+Number(c.max_budget||0),0);
 return <main className="dashboard"><div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">LIVE DATABASE</span><Link href="/creator" className="switch">Creator side →</Link></div>
 <div className="dashHero"><div><span className="eyebrow">ADVERTISER DASHBOARD</span><h1>Put your product<br/><em>in the story.</em></h1><p>Create campaigns, choose your creator requirements, fund the work and review submissions.</p></div><Link className="primary" href="/advertiser/new">＋ Start a new ad</Link></div>
 <AdPlacement placementKey="main_feed" />
 <div className="dashGrid"><section><div className="sectionHead"><h2>Your campaigns</h2><span>{loading?"Loading…":campaigns.length+" campaigns"}</span></div>
 {campaigns.slice(0,5).map(c=><div className="campaign" key={c.id}><div className="campaignIcon">✦</div><div><b>{c.name}</b><small>{c.goal} · {c.platform||"Any platform"}</small></div><strong>{c.desired_results??0} results</strong><span className={c.status==="active"?"live":"review"}>{c.status}</span></div>)}
 {!loading&&campaigns.length===0&&<div className="successBox">No campaigns yet. Start your first campaign above.</div>}</section>
 <aside><span className="eyebrow">CAMPAIGN BUDGETS</span><h3>₦{totalBudget.toLocaleString()}</h3><p>{active.length} active campaign{active.length===1?"":"s"}</p><Link href="/advertiser/new">Fund a campaign →</Link></aside></div>
 <div className="quick"><h2>What do you want to do?</h2><div className="quickGrid"><Link href="/advertiser/new"><b>＋</b><span>Start a new ad</span><small>Tell creators what you want</small></Link><Link href="/advertiser/review"><b>✓</b><span>Review creator work</span><small>Approve or request changes</small></Link><Link href="/advertiser/results"><b>↗</b><span>See campaign results</span><small>Views, clicks and actions</small></Link></div></div>
 </main>
}