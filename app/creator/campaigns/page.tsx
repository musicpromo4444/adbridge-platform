"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;instructions:string|null;platform:string|null;payment_method:string|null;payment_rate:number|null;max_budget:number|null;desired_results:number|null;status:string;created_at:string};
type AcceptedJob={campaign_id:string;status:string};
type Format={campaign_id:string;format:string;status:string;requirements:string};type Target={campaign_id:string;platform:string};

const formatNames:Record<string,string>={web:"Web",web_app:"Web App",android_app:"Android App",ios_app:"iOS App",social_post:"Social Post",social_story:"Social Story",social_reel:"Social Reel",social_video:"Social Video"};const socialPlatforms=["instagram","tiktok","youtube","facebook","x","snapchat","linkedin"];
const label=(value:string|null|undefined)=>(value||"Not specified").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function Campaigns(){
 const[search,setSearch]=useState(""),[platform,setPlatform]=useState("All"),[formatFilter,setFormatFilter]=useState("All"),[tab,setTab]=useState<"available"|"joined"|"completed">("available");
 const[campaigns,setCampaigns]=useState<Campaign[]>([]),[accepted,setAccepted]=useState<AcceptedJob[]>([]),[formats,setFormats]=useState<Format[]>([]),[targets,setTargets]=useState<Target[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let mounted=true;async function load(){if(!supabase){setError("AdBridge database is not connected yet.");setLoading(false);return}
  const{data:{user}}=await supabase.auth.getUser();const creatorId=user?.id||null;
  const[{data,error:queryError},acceptedResult,formatResult,targetResult]=await Promise.all([
   supabase.from("campaigns").select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget,desired_results,status,created_at").eq("status","active").order("created_at",{ascending:false}),
   creatorId?supabase.from("creator_campaigns").select("campaign_id,status").eq("creator_id",creatorId):Promise.resolve({data:[],error:null} as any),
   supabase.from("campaign_formats").select("campaign_id,format,status,requirements"),
   supabase.from("campaign_platforms").select("campaign_id,platform").eq("enabled",true)
  ]);
  if(!mounted)return;if(queryError){setError("We couldn't load campaigns right now.")}else{setCampaigns(data??[]);setAccepted(acceptedResult?.data??[]);setFormats(formatResult?.data??[]);setTargets(targetResult?.data??[])}setLoading(false)}
 load();return()=>{mounted=false}},[]);
 const acceptedMap=useMemo(()=>new Map(accepted.map(j=>[j.campaign_id,j.status])),[accepted]);
 const formatMap=useMemo(()=>{const m=new Map<string,Format[]>();formats.forEach(f=>m.set(f.campaign_id,[...(m.get(f.campaign_id)||[]),f]));return m},[formats]);
 const targetMap=useMemo(()=>{const m=new Map<string,string[]>();targets.forEach(t=>m.set(t.campaign_id,[...(m.get(t.campaign_id)||[]),t.platform]));return m},[targets]);
 const creatorCampaigns=useMemo(()=>campaigns.filter(c=>{const ts=targetMap.get(c.id)||[];return ts.some(t=>t==="all"||socialPlatforms.includes(t))}),[campaigns,targetMap]);
 const availablePlatforms=Array.from(new Set(creatorCampaigns.flatMap(c=>targetMap.get(c.id)||[]).filter(x=>x!=="all"&&socialPlatforms.includes(x))));
 const availableFormats=Array.from(new Set(formats.map(f=>f.format)));
 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return creatorCampaigns.filter(c=>{const fs=formatMap.get(c.id)||[];if(!fs.length)return false;const joinedStatus=acceptedMap.get(c.id),isJoined=Boolean(joinedStatus),isCompleted=["completed","approved","paid"].includes(joinedStatus||"");if(tab==="available"&&isJoined)return false;if(tab==="joined"&&(!isJoined||isCompleted))return false;if(tab==="completed"&&!isCompleted)return false;if(platform!=="All"&&c.platform!==platform)return false;if(formatFilter!=="All"&&!fs.some(f=>f.format===formatFilter))return false;return !q||[c.name,c.goal,c.platform||"",c.payment_method||"",c.instructions||"",...fs.map(f=>f.format)].join(" ").toLowerCase().includes(q)})},[creatorCampaigns,acceptedMap,formatMap,search,platform,formatFilter,tab]);
 return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard wide"><span className="eyebrow">CREATOR CAMPAIGNS</span><h1>Find your next <em>opportunity.</em></h1><p>Every campaign clearly tells you which delivery format it is built for. You cannot accidentally take a format your destination does not support.</p>
 <div className="filterRow"><input className="textInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search campaigns, brands or formats..."/><select className="textInput" value={platform} onChange={e=>setPlatform(e.target.value)}><option>All</option>{availablePlatforms.map(x=><option key={x}>{x}</option>)}</select><select className="textInput" value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}><option>All</option>{availableFormats.map(x=><option key={x}>{formatNames[x]||x}</option>)}</select></div>
 <div className="choiceRow"><button className={tab==="available"?"primary":"secondary"} onClick={()=>setTab("available")}>Available</button><button className={tab==="joined"?"primary":"secondary"} onClick={()=>setTab("joined")}>My campaigns</button><button className={tab==="completed"?"primary":"secondary"} onClick={()=>setTab("completed")}>Completed</button></div>
 {loading&&<div className="successBox">Loading live campaigns...</div>}{!loading&&error&&<div className="successBox">{error}</div>}
 {!loading&&!error&&filtered.length>0&&<div className="opps">{filtered.map(c=>{const joinedStatus=acceptedMap.get(c.id),completed=["completed","approved","paid"].includes(joinedStatus||""),fs=formatMap.get(c.id)||[];return <article key={c.id}><div className="formatBadgeRow">{fs.map(f=><span key={f.format} className="formatBadge">{formatNames[f.format]||f.format}</span>)}</div><b>{c.name}</b><h3>{c.goal}</h3><p>{(targetMap.get(c.id)||[]).map(x=>x==="all"?"All platforms":x).join(" · ")||c.platform||"Any creator platform"} · {label(c.payment_method)}</p><p>{c.instructions||"Follow the advertiser's campaign instructions."}</p><div>{c.payment_rate!==null&&<strong>₦{Number(c.payment_rate).toLocaleString()}</strong>}{c.max_budget!==null&&<span> · Budget ₦{Number(c.max_budget).toLocaleString()}</span>}</div>{fs.map(f=><small key={f.format} className="requirementLine"><b>Requirements:</b> {f.requirements}</small>)}{c.desired_results!==null&&<small>Target: {Number(c.desired_results).toLocaleString()}</small>}{joinedStatus&&<small>Status: {label(joinedStatus)}</small>}{completed?<Link href="/creator/work">View completed work →</Link>:<Link href={"/creator/campaigns/"+c.id}>{joinedStatus?"Continue campaign →":"View & join campaign →"}</Link>}</article>})}</div>}
 {!loading&&!error&&filtered.length===0&&<div className="successBox">{tab==="available"?"No new live campaigns are available yet.":tab==="joined"?"You have no active campaign jobs yet.":"No completed campaigns yet."}</div>}
 </div></main>
}