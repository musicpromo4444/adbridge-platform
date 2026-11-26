"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;platform:string|null;max_budget:number|null;desired_results:number|null;payment_method:string|null;payment_rate:number|null;funded_amount:number|null;status:string};
type Submission={id:string;posted_url:string|null};
type Measurement={campaign_id:string;campaign_name:string;status:string;billing_model:string|null;payment_rate:number|null;submission_count:number;verified_submissions:number;verified_views:number;metric_checks:number;metric_review:number;last_metric_check_at:string|null;clicks_raw:number;unique_clicks_raw:number;click_events:number;clicks_verified:number;clicks_review:number;clicks_blocked:number;conversions_raw:number;conversions_verified:number;conversions_review:number;conversions_blocked:number;publisher_events_raw:number;publisher_events_verified:number;publisher_events_review:number;publisher_events_blocked:number;publisher_impressions_raw:number;publisher_impressions_verified:number;publisher_video_views_raw:number;publisher_video_views_verified:number;publisher_clicks_raw:number;publisher_clicks_verified:number;publisher_installs_raw:number;publisher_installs_verified:number;publisher_conversions_raw:number;publisher_conversions_verified:number;confirmed_funding:number;payouts_released:number;payouts_held:number;open_fraud_flags:number};
const empty:Measurement={campaign_id:"",campaign_name:"",status:"",billing_model:null,payment_rate:null,submission_count:0,verified_submissions:0,verified_views:0,metric_checks:0,metric_review:0,last_metric_check_at:null,clicks_raw:0,unique_clicks_raw:0,click_events:0,clicks_verified:0,clicks_review:0,clicks_blocked:0,conversions_raw:0,conversions_verified:0,conversions_review:0,conversions_blocked:0,publisher_events_raw:0,publisher_events_verified:0,publisher_events_review:0,publisher_events_blocked:0,publisher_impressions_raw:0,publisher_impressions_verified:0,publisher_video_views_raw:0,publisher_video_views_verified:0,publisher_clicks_raw:0,publisher_clicks_verified:0,publisher_installs_raw:0,publisher_installs_verified:0,publisher_conversions_raw:0,publisher_conversions_verified:0,confirmed_funding:0,payouts_released:0,payouts_held:0,open_fraud_flags:0};
const money=(n:number)=>"₦"+Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2});
const number=(n:number)=>Number(n||0).toLocaleString("en-NG");
const readable=(s:string|null)=>String(s||"Not specified").replaceAll("_"," ");
export default function Results(){
 const params=useSearchParams(),requested=params.get("campaign");
 const[campaigns,setCampaigns]=useState<Campaign[]>([]),[campaignId,setCampaignId]=useState(requested||"");
 const[summary,setSummary]=useState<Measurement>(empty),[refreshSubmissions,setRefreshSubmissions]=useState<Submission[]>([]);
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function load(preferred=requested||campaignId){
  if(!supabase){setError("AdBridge database is not connected.");setLoading(false);return}
  const{data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){window.location.href="/login";return}
  const{data:owned,error:campaignError}=await supabase.from("campaigns").select("id,name,goal,platform,max_budget,desired_results,payment_method,payment_rate,funded_amount,status").eq("advertiser_id",user.id).order("created_at",{ascending:false});
  if(campaignError){setError("Campaign results could not be loaded.");setLoading(false);return}
  const list=(owned||[]) as Campaign[];setCampaigns(list);const selected=list.find(c=>c.id===preferred)||list[0];
  if(!selected){setCampaignId("");setSummary(empty);setRefreshSubmissions([]);setLoading(false);return}
  setCampaignId(selected.id);await loadFor(selected.id);
 }
 async function loadFor(id:string){
  if(!supabase||!id)return;
  setLoading(true);setError("");
  const[measurement,submissions]=await Promise.all([
   supabase.rpc("get_campaign_measurement_summary",{p_campaign_id:id}),
   supabase.from("submissions").select("id,posted_url").eq("campaign_id",id)
  ]);
  if(measurement.error||submissions.error){setError("Verified campaign measurement could not be loaded completely. Please refresh.");setLoading(false);return}
  setSummary((measurement.data||empty) as Measurement);setRefreshSubmissions((submissions.data||[]) as Submission[]);setLoading(false);
 }
 useEffect(()=>{void load(requested||"")},[requested]);
 async function refresh(){
  if(!supabase||!refreshSubmissions.length)return;setBusy(true);setMessage("");setError("");
  let requestedChecks=0,failed=0;
  for(const s of refreshSubmissions){if(!s.posted_url)continue;const{error:e}=await supabase.functions.invoke("track-video-metrics",{body:{submission_id:s.id}});if(e)failed++;else requestedChecks++}
  await loadFor(campaignId);setBusy(false);
  setMessage(requestedChecks?"Requested fresh metric checks for "+requestedChecks+" published submission(s)."+(failed?" "+failed+" check(s) failed.":""):failed?"The metric refresh could not be requested.":"No published submissions were ready for refresh.");
 }
 const selected=campaigns.find(c=>c.id===campaignId)||null;
 return <main className="formPage"><Link href="/advertiser" className="back">← Advertiser Dashboard</Link><div className="formCard wide">
 <span className="eyebrow">CAMPAIGN RESULTS · VERIFIED MEASUREMENT</span><h1>Measure your <em>campaign impact.</em></h1><p>Verified counts are separated from raw activity. Suspicious or unverified events do not appear as verified or payable delivery.</p>
 {campaigns.length>0&&<div className="formGrid"><div><label>Choose campaign</label><select className="textInput" value={campaignId} onChange={e=>{setCampaignId(e.target.value);setMessage("");void loadFor(e.target.value)}}>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>}
 {error&&<div className="successBox" role="alert">{error}</div>}{loading&&<div className="successBox">Loading verified measurement…</div>}
 {!loading&&selected&&<>
 <p><b>{selected.name}</b> · {selected.platform||"Multiple platforms"} · {readable(selected.payment_method)}</p>
 <section className="statsGrid"><div><b>VERIFIED PLATFORM VIEWS</b><strong>{number(summary.verified_views)}</strong><small>{summary.verified_submissions} verified post(s), deduplicated by video</small></div><div><b>VERIFIED TRACKING CLICKS</b><strong>{number(summary.clicks_verified)}</strong><small>Low-risk, assessed clicks only</small></div><div><b>RAW LINK CLICKS</b><strong>{number(summary.clicks_raw)}</strong><small>May include activity under review</small></div><div><b>VERIFIED CONVERSIONS</b><strong>{number(summary.conversions_verified)}</strong><small>{summary.conversions_raw} approved postbacks recorded</small></div></section>
 <section className="quick"><h2>Verified website and app publisher delivery</h2><div className="statsGrid"><div><b>VERIFIED IMPRESSIONS</b><strong>{number(summary.publisher_impressions_verified)}</strong><small>{number(summary.publisher_impressions_raw)} raw event(s)</small></div><div><b>VERIFIED VIDEO VIEWS</b><strong>{number(summary.publisher_video_views_verified)}</strong><small>{number(summary.publisher_video_views_raw)} raw event(s)</small></div><div><b>VERIFIED PUBLISHER CLICKS</b><strong>{number(summary.publisher_clicks_verified)}</strong><small>{number(summary.publisher_clicks_raw)} raw event(s)</small></div><div><b>VERIFIED INSTALLS</b><strong>{number(summary.publisher_installs_verified)}</strong><small>{number(summary.publisher_installs_raw)} raw event(s)</small></div><div><b>VERIFIED PUBLISHER CONVERSIONS</b><strong>{number(summary.publisher_conversions_verified)}</strong><small>{number(summary.publisher_conversions_raw)} raw event(s)</small></div></div></section>
 <section className="quick"><h2>Measurement health</h2><div className="statsGrid"><div><b>SUBMISSIONS</b><strong>{number(summary.submission_count)}</strong></div><div><b>VERIFIED SUBMISSIONS</b><strong>{number(summary.verified_submissions)}</strong></div><div><b>METRIC CHECKS</b><strong>{number(summary.metric_checks)}</strong></div><div><b>METRICS IN FRAUD REVIEW</b><strong>{number(summary.metric_review)}</strong></div><div><b>CLICK EVENTS REVIEW</b><strong>{number(summary.clicks_review)}</strong></div><div><b>BLOCKED CLICK EVENTS</b><strong>{number(summary.clicks_blocked)}</strong></div><div><b>CONVERSIONS REVIEW</b><strong>{number(summary.conversions_review)}</strong></div><div><b>BLOCKED CONVERSIONS</b><strong>{number(summary.conversions_blocked)}</strong></div><div><b>PUBLISHER EVENTS REVIEW</b><strong>{number(summary.publisher_events_review)}</strong></div><div><b>OPEN FRAUD FLAGS</b><strong>{number(summary.open_fraud_flags)}</strong></div></div><p>{summary.last_metric_check_at?"Last platform metric refresh: "+new Date(summary.last_metric_check_at).toLocaleString():"No platform metric refresh yet."}</p><button className="primary" disabled={busy||!refreshSubmissions.some(s=>!!s.posted_url)} onClick={refresh}>{busy?"Checking metrics…":"Check latest platform metrics"}</button>{message&&<div className="successBox">{message}</div>}</section>
 <section className="quick"><h2>Campaign budget</h2><p>{money(summary.confirmed_funding)} confirmed funding · {money(Number(selected.max_budget||0))} maximum budget</p><p>{money(Number(selected.payment_rate||0))} per {selected.payment_method==="cpm"||selected.payment_method==="views"?"1,000 views":selected.payment_method==="cpc"||selected.payment_method==="link_traffic"?"verified click":selected.payment_method==="cpi"?"install":selected.payment_method==="cpa"?"verified conversion":"approved delivery"}</p><div className="statsGrid"><div><b>RELEASED PAYOUTS</b><strong>{money(summary.payouts_released)}</strong></div><div><b>PAYMENTS HELD</b><strong>{money(summary.payouts_held)}</strong></div></div><Link href={"/advertiser/review?campaign="+selected.id}>View campaign review summary →</Link></section>
 </>}
 {!loading&&!selected&&<div className="notificationEmpty"><h2>No campaign results yet</h2><p>Create and fund a campaign to begin measuring delivery.</p><Link href="/advertiser/new">Create a campaign →</Link></div>}
 </div></main>
}
