"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";
import {supabase} from "@/lib/supabase";
export default function Fund(){
 const p=useSearchParams(); const [funded,setFunded]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const goal=p.get("goal")||"video",platform=p.get("platform")||"TikTok",method=p.get("method")||"job";
 const name=p.get("name")||"Untitled campaign",instructions=p.get("instructions")||"",assets=p.get("assets")||"",rate=p.get("rate")||"0",budget=p.get("budget")||"0",results=p.get("results")||"0";
 const label=method==="views"?"Per 1,000 views":method==="clicks"?"Per website visit":method==="installs"?"Per app install":method==="actions"?"Per completed action":method==="placement"?"Product placement":"Per completed creator job";
 async function createCampaign(){
  if(!supabase){setError("Database connection is not ready.");return}
  setSaving(true); setError("");
  const {data,error:e}=await supabase.from("campaigns").insert({name,goal,instructions,platform,payment_method:method,payment_rate:Number(rate)||0,max_budget:Number(budget)||0,desired_results:Number(results.replaceAll(",",""))||0,status:"active",funded_amount:Number(budget)||0}).select("id").single();
  if(e){setError("We couldn't create the campaign yet.");setSaving(false);return}
  if(assets){await supabase.from("campaign_assets").insert(assets.split(",").filter(Boolean).map(asset_type=>({campaign_id:data.id,asset_type})))}
  setFunded(true); setSaving(false);
 }
 return <main className="formPage"><Link href={"/advertiser/new/payment?goal="+goal+"&platform="+encodeURIComponent(platform)+"&method="+method} className="back">← Payment</Link><div className="formCard wide"><span className="eyebrow">STEP 4 OF 5</span><h1>Review and <em>fund your campaign.</em></h1><p>Check everything before your campaign goes live.</p>
 <div className="summary"><b>{name}</b><span>Platform: {platform}</span><span>Payment: {label}</span><span>Rate: ₦{Number(rate||0).toLocaleString()}</span><span>Maximum budget: ₦{Number(budget||0).toLocaleString()}</span></div>
 <div className="infoBox"><b>Your money is protected.</b><p>Funds are reserved for this campaign and released when creators complete the agreed work and you approve it.</p></div>{error&&<div className="successBox">{error}</div>}
 <button className="primary fullButton" disabled={saving||funded} onClick={createCampaign}>{saving?"Creating campaign…":funded?"Campaign live ✓":"Fund & launch campaign →"}</button>
 {funded&&<div className="successBox"><b>Your campaign is live.</b><br/>It is now available for creators to discover.</div>}<Link className="secondary fullButton" href="/advertiser">Go to advertiser dashboard</Link></div></main>
}