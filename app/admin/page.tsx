"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Stats={users:number;creators:number;advertisers:number;campaigns:number;active:number;paused:number;closed:number;submissions:number;pendingReviews:number;payments:number;funded:number;released:number;withdrawals:number;pendingWithdrawals:number;ads:number;activeAds:number};
type Activity={label:string;detail:string;time:string};

export default function Admin(){
 const [stats,setStats]=useState<Stats>({users:0,creators:0,advertisers:0,campaigns:0,active:0,paused:0,closed:0,submissions:0,pendingReviews:0,payments:0,funded:0,released:0,withdrawals:0,pendingWithdrawals:0,ads:0,activeAds:0});
 const [activity,setActivity]=useState<Activity[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[allow,setAllow]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function load(){
  if(!supabase){setError("Database connection is not ready.");setLoading(false);return}
  const [users,campaigns,subs,payments,withdrawals,settings,ads]=await Promise.all([
   supabase.from("profiles").select("id,role,created_at,display_name").order("created_at",{ascending:false}),
   supabase.from("campaigns").select("id,name,status,max_budget,funded_amount,created_at").order("created_at",{ascending:false}),
   supabase.from("submissions").select("id,status,submitted_at").order("submitted_at",{ascending:false}),
   supabase.from("campaign_payments").select("id,amount,status,type,created_at,campaigns(name)").order("created_at",{ascending:false}),
   supabase.from("creator_withdrawals").select("id,amount,status,created_at").order("created_at",{ascending:false}),
   supabase.from("platform_settings").select("allow_new_campaigns").eq("id",1).maybeSingle(),
   supabase.from("ad_placements").select("id,enabled,created_at").order("created_at",{ascending:false})
  ]);
  const failed=[users,campaigns,subs,payments,withdrawals,settings,ads].some((x:any)=>x.error);
  if(failed)setError("Some dashboard data could not be loaded.");
  const us=users.data||[],cs=campaigns.data||[],ss=subs.data||[],ps=payments.data||[],ws=withdrawals.data||[],ad=ads.data||[];
  setAllow(settings.data?.allow_new_campaigns??true);
  setStats({
   users:us.length,creators:us.filter((x:any)=>x.role==="creator").length,advertisers:us.filter((x:any)=>x.role==="advertiser").length,
   campaigns:cs.length,active:cs.filter((x:any)=>x.status==="active").length,paused:cs.filter((x:any)=>x.status==="paused").length,closed:cs.filter((x:any)=>x.status==="closed").length,
   submissions:ss.length,pendingReviews:ss.filter((x:any)=>x.status==="submitted").length,payments:ps.length,
   funded:ps.filter((x:any)=>x.type==="funding").reduce((a:any,x:any)=>a+Number(x.amount||0),0),
   released:ps.filter((x:any)=>x.status==="released").reduce((a:any,x:any)=>a+Number(x.amount||0),0),
   withdrawals:ws.length,pendingWithdrawals:ws.filter((x:any)=>x.status==="pending").length,ads:ad.length,activeAds:ad.filter((x:any)=>x.enabled).length
  });
  const a:Activity[]=[];
  cs.slice(0,4).forEach((x:any)=>a.push({label:"Campaign",detail:x.name,time:x.created_at}));
  ss.slice(0,3).forEach((x:any)=>a.push({label:"Submission",detail:"Creator work submitted",time:x.submitted_at}));
  ps.slice(0,3).forEach((x:any)=>a.push({label:"Payment",detail:"₦"+Number(x.amount||0).toLocaleString()+" · "+(x.campaigns?.name||"Campaign"),time:x.created_at}));
  setActivity(a.sort((x,y)=>new Date(y.time).getTime()-new Date(x.time).getTime()).slice(0,8));setLoading(false)
 }
 useEffect(()=>{load()},[]);
 async function toggleCampaigns(){
  if(!supabase)return;setBusy(true);setMessage("");setError("");
  const next=!allow;const {error:e}=await supabase.from("platform_settings").upsert({id:1,allow_new_campaigns:next,updated_at:new Date().toISOString()},{onConflict:"id"});
  if(e)setError("Couldn't change campaign availability.");else{setAllow(next);setMessage(next?"New campaigns are allowed.":"New campaigns are paused.")}setBusy(false)
 }
 const money=(n:number)=>"₦"+n.toLocaleString();
 return <main className="dashboard">
  <div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">ADMIN CONTROL CENTER</span><Link href="/advertiser" className="switch">Advertiser →</Link></div>
  <div className="dashHero"><div><span className="eyebrow">ADMIN DASHBOARD</span><h1>Control the <em>marketplace.</em></h1><p>One place for operations, money, people, campaigns, ads and platform controls.</p></div></div>
  {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
  <div className="statsGrid">
   <div><b>Users</b><strong>{loading?"—":stats.users}</strong><small>{stats.creators} creators · {stats.advertisers} advertisers</small></div>
   <div><b>Campaigns</b><strong>{loading?"—":stats.campaigns}</strong><small>{stats.active} active · {stats.paused} paused</small></div>
   <div><b>Needs review</b><strong>{loading?"—":stats.pendingReviews}</strong><small>Creator submissions waiting</small></div>
   <div><b>Funded</b><strong>{loading?"—":money(stats.funded)}</strong><small>{stats.payments} payment records</small></div>
  </div>
  <div className="statsGrid">
   <div><b>Released to creators</b><strong>{loading?"—":money(stats.released)}</strong><small>Approved campaign earnings</small></div>
   <div><b>Withdrawals</b><strong>{loading?"—":stats.pendingWithdrawals}</strong><small>Pending of {stats.withdrawals} requests</small></div>
   <div><b>Ad placements</b><strong>{loading?"—":stats.activeAds+"/"+stats.ads}</strong><small>Active universal placements</small></div>
   <div><b>Marketplace</b><strong>{allow?"ON":"OFF"}</strong><small>New campaign creation</small></div>
  </div>
  <div className="quickGrid adminGrid">
   <Link href="/admin/campaigns"><b>◈</b><span>Campaigns</span><small>Review, pause, reopen and monitor</small></Link>
   <Link href="/admin/users"><b>●</b><span>Users</span><small>Creators and advertisers</small></Link>
   <Link href="/admin/payments"><b>₦</b><span>Payments</span><small>Funding and released money</small></Link>
   <Link href="/admin/withdrawals"><b>↗</b><span>Withdrawals</span><small>{stats.pendingWithdrawals} pending requests</small></Link>
   <Link href="/admin/ads"><b>✦</b><span>Ads Manager</span><small>Formats, providers, targeting and caps</small></Link>
   <Link href="/admin/settings"><b>⚙</b><span>Platform Settings</span><small>Commission and marketplace rules</small></Link>
  </div>
  <div className="formCard wide">
   <span className="eyebrow">QUICK CONTROL</span><h2>Marketplace availability</h2>
   <p>Turn new campaign creation on or off without taking existing campaigns offline.</p>
   <div className="choiceRow"><button className={allow?"primary":"secondary"} disabled={busy} onClick={toggleCampaigns}>{busy?"Saving…":allow?"New campaigns: ON":"New campaigns: OFF"}</button><Link className="secondary" href="/admin/settings">Open all settings</Link></div>
  </div>
  <div className="formCard wide">
   <span className="eyebrow">OPERATIONS</span><h2>What needs attention</h2>
   <div className="opps">
    <Link href="/admin/review" className="infoBox"><b>SUBMISSIONS</b><h3>{stats.pendingReviews} waiting for review</h3><small>Open creator review queue</small></Link>
    <Link href="/admin/withdrawals" className="infoBox"><b>WITHDRAWALS</b><h3>{stats.pendingWithdrawals} pending</h3><small>Review creator withdrawal requests</small></Link>
    <Link href="/admin/ads" className="infoBox"><b>ADS</b><h3>{stats.activeAds} active placements</h3><small>Manage universal ad delivery</small></Link>
   </div>
  </div>
  <div className="formCard wide"><span className="eyebrow">RECENT ACTIVITY</span><h2>What's happening</h2>{loading?<div className="successBox">Loading activity…</div>:activity.length?<div className="opps">{activity.map((x,i)=><article key={i}><b>{x.label.toUpperCase()}</b><h3>{x.detail}</h3><small>{new Date(x.time).toLocaleString()}</small></article>)}</div>:<div className="successBox">No activity yet.</div>}</div>
 </main>
}