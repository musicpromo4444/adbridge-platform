"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
type Job={id:string;status:string;campaign_id:string;campaign?:{name:string;goal:string;platform:string|null;payment_rate:number|null;instructions:string|null}};
export default function Work(){
 const [jobs,setJobs]=useState<Job[]>([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{async function load(){if(!supabase){setLoading(false);return}const ids=JSON.parse(localStorage.getItem("adbridge-jobs")||"[]") as string[];if(!ids.length){setLoading(false);return}const {data}=await supabase.from("creator_campaigns").select("id,status,campaign_id,campaigns(name,goal,platform,payment_rate,instructions)").in("id",ids);setJobs((data??[]) as any);setLoading(false)}load()},[]);
 return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard wide"><span className="eyebrow">MY WORK</span><h1>Track your <em>campaign jobs.</em></h1><p>Accepted campaigns move through creation, submission, review and payment.</p>
 {loading&&<div className="successBox">Loading your work...</div>}
 {!loading&&!jobs.length&&<div className="successBox">You have no accepted campaigns yet. <Link href="/creator/campaigns">Find a campaign →</Link></div>}
 <div className="opps">{jobs.map(j=><article key={j.id}><b>{j.status.replace("_"," ").toUpperCase()}</b><h3>{j.campaign?.name}</h3><p>{j.campaign?.platform||"Any platform"} · ₦{Number(j.campaign?.payment_rate||0).toLocaleString()}</p><p>{j.campaign?.instructions}</p>{j.status==="accepted"||j.status==="in_progress"?<><Link className="primary" href={"/creator/studio?campaign="+j.campaign_id}>Create with AI Studio →</Link><Link className="secondary" href={"/creator/submit?job="+j.id}>Send completed work →</Link></>:j.status==="submitted"?<div className="successBox">Waiting for advertiser approval.</div>:j.status==="approved"||j.status==="completed"?<div className="successBox">{j.status==="completed"?"Completed and paid.":"Approved. Payment is being processed."}</div>:<div className="successBox">Changes were requested. Update and resubmit.</div>}</article>)}</div>
 <div className="quick"><h2>Campaign journey</h2><p>Accepted → Create → Submit → Advertiser reviews → Approval → Payment</p></div></div></main>
}