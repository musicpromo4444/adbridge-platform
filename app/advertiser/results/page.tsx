"use client";
import Link from "next/link";import {useSearchParams} from "next/navigation";import {useEffect,useState} from "react";import {supabase} from "@/lib/supabase";
export default function Results(){
 const p=useSearchParams();const id=p.get("campaign");const [c,setC]=useState<any>(null);const [subs,setSubs]=useState<any[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function load(){
  if(!supabase)return;
  let q=supabase.from("campaigns").select("id,name,goal,platform,max_budget,desired_results,payment_method,payment_rate").limit(1);if(id)q=q.eq("id",id);
  const {data}=await q.single();if(!data)return;setC(data);
  const {data:s}=await supabase.from("submissions").select("id,status,creator_id,posted_url,tracking_platform,current_metric,target_metric,metric_status,last_metric_check_at").eq("campaign_id",data.id).order("submitted_at",{ascending:false});setSubs(s??[]);
 }
 useEffect(()=>{load()},[id]);
 const refresh=async()=>{
  if(!supabase||!subs.length)return;setBusy(true);setMessage("");let done=0;
  for(const s of subs){if(!s.posted_url)continue;const {error}=await supabase.functions.invoke("track-video-metrics",{body:{submission_id:s.id}});if(!error)done++;}
  await load();setBusy(false);setMessage(done?"Checked "+done+" published video"+(done===1?"":"s")+".":"No video could be checked yet.");
 };
 const totalViews=subs.reduce((n,s)=>n+Number(s.current_metric||0),0);const approved=subs.filter(s=>s.status==="approved").length;
 return <main className="formPage"><Link href="/advertiser" className="back">← Advertiser Dashboard</Link><div className="formCard wide"><span className="eyebrow">CAMPAIGN RESULTS</span><h1>See what your <em>campaign achieved.</em></h1>
 {c?<><p>{c.name} · {c.platform||"Any platform"}</p><div className="statsGrid"><div><b>Verified views</b><strong>{totalViews.toLocaleString()}</strong></div><div><b>Target</b><strong>{Number(c.desired_results||0).toLocaleString()}</strong></div><div><b>Submissions</b><strong>{subs.length}</strong></div><div><b>Approved</b><strong>{approved}</strong></div></div>
 <div className="quick"><h2>View tracking</h2><p>AdBridge checks the published video against the platform's available metrics. A target is not treated as reached from a creator-entered number.</p><button className="primary" disabled={busy||!subs.length} onClick={refresh}>{busy?"Checking videos…":"Check latest views"}</button>{message&&<div className="successBox">{message}</div>}</div>
 {subs.length>0&&<div className="quick"><h2>Creator videos</h2>{subs.map(s=><div key={s.id} style={{padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,.08)"}}><b>{s.tracking_platform||"Platform"}</b><p>{Number(s.current_metric||0).toLocaleString()} / {Number(s.target_metric||c.desired_results||0).toLocaleString()} views · {s.metric_status||"pending"}</p>{s.last_metric_check_at&&<small>Last checked {new Date(s.last_metric_check_at).toLocaleString()}</small>}<br/><a href={s.posted_url||"#"} target="_blank" rel="noreferrer">Open published video →</a></div>)}</div>}
 <div className="quick"><h2>Campaign budget</h2><p>₦{Number(c.max_budget||0).toLocaleString()} maximum budget · ₦{Number(c.payment_rate||0).toLocaleString()} per 1,000 views</p><Link href="/advertiser/review">Review creator work →</Link></div></>:<div className="successBox">Select a campaign from Your Campaigns.</div>}</div></main>
}