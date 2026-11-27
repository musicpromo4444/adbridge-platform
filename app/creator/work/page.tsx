"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { name: string; goal: string; platform: string | null; payment_rate: number | null; instructions: string | null };
type Job = { id: string; status: string; campaign_id: string; campaigns?: Campaign | Campaign[] | null };
const first = <T,>(v:T|T[]|null|undefined):T|null => Array.isArray(v) ? v[0] ?? null : v ?? null;
const statusLabel = (s:string) => s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function Work() {
  const [jobs,setJobs]=useState<Job[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    async function load(){
      if(!supabase){setError("AdBridge database connection is not ready.");setLoading(false);return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){window.location.href="/login";return;}
      const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
      if(profileError){setError("Your creator profile could not be verified.");setLoading(false);return;}
      if(profile?.role!=="creator"){window.location.href="/";return;}
      const {data,error:queryError}=await supabase.from("creator_campaigns").select("id,status,campaign_id,campaigns(name,goal,platform,payment_rate,instructions)").eq("creator_id",user.id).order("created_at",{ascending:false});
      if(!live)return;
      if(queryError)setError("Your campaign jobs could not be loaded. Refresh to retry.");
      else setJobs((data??[]) as unknown as Job[]);
      setLoading(false);
    }
    void load();return()=>{live=false};
  },[]);
  return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard wide">
    <span className="eyebrow">MY WORK</span><h1>Track your <em>campaign jobs.</em></h1><p>Accepted campaigns move through creation, submission, review, approval and payment.</p>
    {error&&<div className="successBox" role="alert">{error}</div>}
    {loading&&<div className="successBox">Loading your campaign work…</div>}
    {!loading&&!error&&!jobs.length&&<div className="successBox">You have no accepted campaigns yet. <Link href="/creator/campaigns">Find a campaign →</Link></div>}
    {!loading&&jobs.length>0&&<div className="opps">{jobs.map(j=>{const c=first(j.campaigns);return <article key={j.id}><b>{statusLabel(j.status)}</b><h3>{c?.name||"Campaign"}</h3><p>{c?.platform||"Multiple platforms"} · ₦{Number(c?.payment_rate||0).toLocaleString("en-NG")}</p>{c?.instructions&&<p>{c.instructions}</p>}{["accepted","in_progress","changes_requested"].includes(j.status)?<><Link className="primary" href={"/creator/studio?campaign="+j.campaign_id}>Create with AI Studio →</Link><Link className="secondary" href={"/creator/submit?job="+j.id}>Submit or resubmit completed work →</Link></>:j.status==="submitted"?<div className="successBox">Submitted. Waiting for advertiser review.</div>:j.status==="approved"?<div className="successBox">Approved. Your payment is being processed.</div>:j.status==="completed"||j.status==="paid"?<div className="successBox">Completed and paid.</div>:<div className="successBox">Status: {statusLabel(j.status)}. Review the campaign activity for next steps.</div>}</article>})}</div>}
    <div className="quick"><h2>Campaign journey</h2><p>Accept → Create → Publish → Submit → Review → Approval → Payment</p><Link className="secondary" href="/creator/earnings">View earnings and withdrawal status →</Link></div>
  </div></main>;
}
