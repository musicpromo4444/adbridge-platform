"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";

type Job = {
  id: string;
  status: string;
  campaigns: { name: string; payment_rate: number | null; platform: string | null } | { name: string; payment_rate: number | null; platform: string | null }[] | null;
};
type PublisherProperty = { id:string; name:string; property_type:string; verified:boolean };
type PublisherApplication = { status:string };
const first = <T,>(value:T|T[]|null|undefined):T|null => Array.isArray(value) ? value[0] ?? null : value ?? null;

const links = [
  {href:"/creator/campaigns",title:"Campaign marketplace",desc:"Discover and apply for creator campaigns",icon:"✦"},
  {href:"/creator/work",title:"My accepted work",desc:"Create, submit, track reviews and approvals",icon:"▤"},
  {href:"/publisher",title:"Publisher delivery centre",desc:"Apply to run ads on websites and apps",icon:"↗"},
  {href:"/publisher/applications",title:"Publisher applications",desc:"Track campaign applications and properties",icon:"✓"},
  {href:"/creator/connections",title:"Social connections",desc:"Connect social accounts for supported verification",icon:"◎"},
  {href:"/creator/verification",title:"Creator verification",desc:"Submit your public AdBridge promotion post",icon:"◆"},
  {href:"/creator/analytics",title:"Analytics",desc:"Review verified views, clicks and results",icon:"▥"},
  {href:"/creator/earnings",title:"Earnings & withdrawals",desc:"Balances, holds, payout methods and history",icon:"₦"},
  {href:"/creator/profile",title:"Public profile",desc:"Update your creator profile and bio",icon:"●"},
  {href:"/creator/studio",title:"AI Studio",desc:"Prepare campaign content and creative",icon:"✧"},
  {href:"/creator/ai",title:"AI Post",desc:"Generate post drafts and captions",icon:"✦"},
  {href:"/creator/post",title:"Post Studio",desc:"Edit and save your social post",icon:"▣"},
  {href:"/rankings",title:"Global rankings",desc:"Worldwide top creators and advertisers",icon:"№"},
  {href:"/notifications",title:"Notifications",desc:"Check reviews, updates and notices",icon:"◉"},
  {href:"/integrations",title:"Integration hub",desc:"Connect accounts and setup tracking",icon:"↔"},
];

export default function CreatorDashboard() {
  const [jobs,setJobs]=useState<Job[]>([]);
  const [properties,setProperties]=useState<PublisherProperty[]>([]);
  const [applications,setApplications]=useState<PublisherApplication[]>([]);
  const [verified,setVerified]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    async function load(){
      if(!supabase){setError("AdBridge database is not connected.");setLoading(false);return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){window.location.href="/login";return;}
      const [jobRes,profileRes,propertyRes,applicationRes]=await Promise.all([
        supabase.from("creator_campaigns").select("id,status,campaigns(name,payment_rate,platform)").eq("creator_id",user.id).order("created_at",{ascending:false}),
        supabase.from("profiles").select("verified").eq("id",user.id).maybeSingle(),
        supabase.from("publisher_properties").select("id,name,property_type,verified").eq("publisher_id",user.id).order("created_at",{ascending:false}),
        supabase.from("publisher_campaigns").select("status").eq("publisher_id",user.id),
      ]);
      if(!live)return;
      if(jobRes.error||propertyRes.error||applicationRes.error)setError("Some dashboard information could not be loaded. Refresh to retry.");
      setJobs((jobRes.data||[]) as unknown as Job[]);
      setVerified(!!profileRes.data?.verified);
      setProperties((propertyRes.data||[]) as PublisherProperty[]);
      setApplications((applicationRes.data||[]) as PublisherApplication[]);
      setLoading(false);
    }
    void load();return()=>{live=false};
  },[]);
  const counts=useMemo(()=>({
    active:jobs.filter(j=>["accepted","in_progress"].includes(j.status)).length,
    submitted:jobs.filter(j=>j.status==="submitted").length,
    approved:jobs.filter(j=>["approved","completed","paid"].includes(j.status)).length,
    publisherApplied:applications.filter(a=>a.status==="applied").length,
    publisherApproved:applications.filter(a=>a.status==="approved").length,
    verifiedProperties:properties.filter(p=>p.verified).length,
    pendingProperties:properties.filter(p=>!p.verified).length,
  }),[jobs,applications,properties]);
  const statusLabel=(s:string)=>s.replaceAll("_"," ");
  return <main className="dashboard creatorDash">
    <div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">CREATOR & PUBLISHER WORKSPACE</span><Link href="/advertiser" className="switch">Advertiser side →</Link><NotificationBell /></div>
    <section className="dashHero"><div><span className="eyebrow">YOUR ADBRIDGE WORKSPACE</span><h1>Find opportunities.<br/><em>Deliver. Earn.</em></h1><p>Manage social campaigns and website/app ad inventory from one place. Campaign results and earnings only count when AdBridge verifies them.</p></div><div className="choiceRow"><Link className="primary" href="/creator/campaigns">Browse creator campaigns ↗</Link><Link className="secondary" href="/publisher">Open publisher centre ↗</Link></div></section>
    {error&&<div className="successBox" role="alert">{error}</div>}
    <section className="statsGrid" aria-label="Dashboard overview">
      <div><b>ACTIVE CREATOR JOBS</b><strong>{loading?"—":counts.active}</strong><small>Accepted and in progress</small></div>
      <div><b>SUBMITTED FOR REVIEW</b><strong>{loading?"—":counts.submitted}</strong><small>Awaiting advertiser review</small></div>
      <div><b>APPROVED CREATOR WORK</b><strong>{loading?"—":counts.approved}</strong><small>Approved, completed or paid</small></div>
      <div><b>VERIFIED PUBLISHER PROPERTIES</b><strong>{loading?"—":counts.verifiedProperties}</strong><small>{loading?"Loading":counts.pendingProperties+" waiting for verification"}</small></div>
    </section>
    <section className="statsGrid" aria-label="Publisher application summary">
      <div><b>PUBLISHER APPLICATIONS</b><strong>{loading?"—":applications.length}</strong><small>All submitted combinations</small></div>
      <div><b>WAITING FOR REVIEW</b><strong>{loading?"—":counts.publisherApplied}</strong><small>Publisher applications</small></div>
      <div><b>APPROVED PLACEMENTS</b><strong>{loading?"—":counts.publisherApproved}</strong><small>Accepted inventory</small></div>
      <div><b>CREATOR LISTING</b><strong>{loading?"—":verified?"VERIFIED":"PENDING"}</strong><small>{verified?"Your listing is verified":"Submit a public promo post to verify"}</small></div>
    </section>
    <div className="dashGrid">
      <section><div className="sectionHead"><h2>Recent creator work</h2><Link href="/creator/work">See all →</Link></div>
        {loading&&<div className="successBox">Loading your campaign activity…</div>}
        {!loading&&jobs.slice(0,5).map(job=>{const campaign=first(job.campaigns);return <article className="campaign" key={job.id}><div className="campaignIcon">▶</div><div className="campaignInfo"><b>{campaign?.name||"Campaign"}</b><small>{campaign?.platform||"Multiple platforms"}</small><small>₦{Number(campaign?.payment_rate||0).toLocaleString("en-NG")}</small></div><span className={["approved","completed","paid"].includes(job.status)?"live":"review"}>{statusLabel(job.status)}</span></article>})}
        {!loading&&!jobs.length&&<div className="successBox">No accepted creator jobs yet. <Link href="/creator/campaigns">Find your first campaign →</Link></div>}
      </section>
      <aside><span className="eyebrow">PUBLISHER INVENTORY</span><h3>Your properties</h3>{loading?<p>Loading properties…</p>:properties.length?properties.slice(0,4).map(p=><p key={p.id}><b>{p.name}</b><small style={{display:"block"}}>{p.property_type.replaceAll("_"," ")} · {p.verified?"Verified":"Under review"}</small></p>):<p>You have not added a website or app yet.</p>}<Link href="/publisher">Manage properties & apply →</Link><p><Link href="/publisher/applications">Application status →</Link></p><p><Link href="/publisher/integration">Server integration →</Link></p></aside>
    </div>
    <section className="quick"><h2>Workspace tools</h2><div className="quickGrid">{links.map(item=><Link href={item.href} key={item.href}><b>{item.icon}</b><span>{item.title}</span><small>{item.desc}</small></Link>)}</div></section>
    <div className="infoBox"><b>Payment and verification safety</b><p>Social metrics, publisher events and campaign outcomes are reviewed for authenticity. Tracking-link clicks alone are not verified views, and unverified events do not become payable earnings.</p><Link href="/creator/analytics">View verified performance →</Link></div>
  </main>;
}
