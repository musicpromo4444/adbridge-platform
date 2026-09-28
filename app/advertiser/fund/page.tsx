"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";

export default function Fund(){
 const params=useSearchParams();
 const platform=params.get("platform")||"TikTok";
 const method=params.get("method")||"job";
 const [funded,setFunded]=useState(false);
 return <main className="formPage">
  <Link href={"/advertiser/new/payment?platform="+encodeURIComponent(platform)+"&method="+method} className="back">← Payment</Link>
  <div className="formCard wide">
   <span className="eyebrow">STEP 4 OF 5</span>
   <h1>Review and <em>fund your campaign.</em></h1>
   <p>Check everything before your campaign goes live.</p>
   <div className="summary">
    <b>Your campaign</b>
    <span>Platform: {platform}</span>
    <span>Payment: {method==="views"?"Per 1,000 views":method==="clicks"?"Per website visit":method==="installs"?"Per app install":method==="actions"?"Per completed action":method==="placement"?"Product placement":"Per completed creator job"}</span>
    <span>Maximum budget: Set by you</span>
   </div>
   <div className="infoBox"><b>Your money is protected.</b><p>Funds are reserved for this campaign and released when creators complete the agreed work and you approve it. Unused campaign funds remain available according to the campaign terms.</p></div>
   <button className="primary fullButton" onClick={()=>setFunded(true)}>{funded?"Campaign funded ✓":"Fund campaign →"}</button>
   {funded&&<div className="successBox"><b>Your campaign is live.</b><br/>Creators can now discover it, accept the work and start creating.</div>}
   <Link className="secondary fullButton" href="/advertiser">Go to advertiser dashboard</Link>
  </div>
 </main>
}