"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
type Status="open"|"reviewing"|"resolved"|"dismissed"|"all";
type Flag={id:string;campaign_id:string;creator_id:string;tracking_event_id:string|null;conversion_id:string|null;flag_type:string;severity:string;reason:string;score:number;status:string;created_at:string;resolved_at:string|null};\ntype Health={events_24h:number;verified_24h:number;review_queue:number;blocked_24h:number;payable_24h:number};
export default function FraudReview(){
 const[filter,setFilter]=useState<Status>("open"),[flags,setFlags]=useState<Flag[]>([]),[health,setHealth]=useState<Health>({events_24h:0,verified_24h:0,review_queue:0,blocked_24h:0,payable_24h:0}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{if(!supabase){setError("Database connection is not ready.");setLoading(false);return}setLoading(true);setError("");const [{data,error:e},{data:healthData,error:healthError}]=await Promise.all([supabase.rpc("admin_list_fraud_flags",{p_status:filter,p_limit:200}),supabase.rpc("admin_fraud_health")]);if(e){setError(e.message||"Could not load fraud flags.");setFlags([])}else setFlags((data?.flags||[]) as Flag[]);if(!healthError&&healthData)setHealth(healthData as Health);setLoading(false)},[filter]);
 useEffect(()=>{void load()},[load]);
 async function resolve(id:string,status:"reviewing"|"resolved"|"dismissed"){if(!supabase)return;setBusy(id);setError("");setMessage("");const{error:e}=await supabase.rpc("admin_resolve_fraud_flag",{p_flag_id:id,p_resolution:status});if(e)setError(e.message||"Could not update this review.");else{setMessage("Flag moved to "+status+".");await load()}setBusy("")}
 return <main className="formPage"><Link href="/admin" className="back">← Admin</Link><div className="formCard wide">
 <span className="eyebrow">ADMIN · TRUST & SAFETY</span><h1>Fraud <em>review queue.</em></h1><p>Review suspicious click activity. Flags do not automatically punish creators; held payments remain blocked until all related open reviews are resolved or dismissed.</p>
 <div className="statsGrid"><div><b>Events assessed · 24h</b><strong>{loading?"—":health.events_24h}</strong><small>Social, website and app activity</small></div><div><b>Verified events · 24h</b><strong>{loading?"—":health.verified_24h}</strong><small>Trusted source and evidence required</small></div><div><b>Review queue</b><strong>{loading?"—":health.review_queue}</strong><small>Needs investigation</small></div><div><b>Blocked · 24h</b><strong>{loading?"—":health.blocked_24h}</strong><small>High-risk activity</small></div></div>\n <div className="choiceRow">{(["open","reviewing","resolved","dismissed","all"] as Status[]).map(s=><button key={s} className={filter===s?"primary":"secondary"} onClick={()=>setFilter(s)}>{s[0].toUpperCase()+s.slice(1)}</button>)}</div>
 {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
 {loading?<div className="successBox">Loading fraud flags…</div>:flags.length?<div className="opps">{flags.map(f=><article key={f.id}>
 <div className="formatBadgeRow"><span className="formatBadge">{f.severity.toUpperCase()} · SCORE {f.score}</span><span className="formatBadge">{f.status.toUpperCase()}</span></div>
 <h3>{f.flag_type.replaceAll("_"," ")}</h3><p>{f.reason}</p><small>Creator: {f.creator_id}</small><br/><small>Campaign: {f.campaign_id}</small><br/><small>{new Date(f.created_at).toLocaleString()}</small>
 {f.status!=="resolved"&&f.status!=="dismissed"&&<div className="choiceRow"><button className="secondary" disabled={!!busy} onClick={()=>void resolve(f.id,"reviewing")}>Mark reviewing</button><button className="primary" disabled={!!busy} onClick={()=>void resolve(f.id,"resolved")}>{busy===f.id?"Saving…":"Resolve"}</button><button className="secondary" disabled={!!busy} onClick={()=>void resolve(f.id,"dismissed")}>Dismiss</button></div>}
 </article>)}</div>:<div className="successBox">No {filter==="all"?"":filter+" "}fraud flags found.</div>}
 </div></main>
}