"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Status="open"|"reviewing"|"resolved"|"dismissed"|"all";
type Flag={id:string;campaign_id:string;creator_id:string;tracking_event_id:string|null;conversion_id:string|null;flag_type:string;severity:string;reason:string;score:number;status:string;created_at:string;resolved_at:string|null};
type Health={events_24h:number;verified_24h:number;review_queue:number;blocked_24h:number;payable_24h:number;click_events_24h:number;publisher_events_24h:number;metric_checks_24h:number;conversion_events_24h:number;open_flags:number};
type EvidenceEvent={source_table:string;source_row_id:string;event_id:string|null;event_type:string;risk_score:number;risk_status:string;verification_status:string;verified:boolean;payable:boolean;risk_reasons:string[];ip_hash:string|null;visitor_hash:string|null;session_hash:string|null;user_agent_hash:string|null;evidence:Record<string,unknown>;created_at:string};
type EvidencePayment={id:string;amount:number;status:string;created_at:string;source_click_id:string|null;source_event_id:string|null;source_ad_placement_event_id:string|null};
type Evidence={ok:boolean;campaign_name:string|null;events:EvidenceEvent[];payments:EvidencePayment[]};

const emptyHealth:Health={events_24h:0,verified_24h:0,review_queue:0,blocked_24h:0,payable_24h:0,click_events_24h:0,publisher_events_24h:0,metric_checks_24h:0,conversion_events_24h:0,open_flags:0};
const money=(value:number)=>"₦"+Number(value||0).toLocaleString("en-NG",{maximumFractionDigits:2});

export default function FraudReview(){
 const[filter,setFilter]=useState<Status>("open");
 const[flags,setFlags]=useState<Flag[]>([]);
 const[health,setHealth]=useState<Health>(emptyHealth);
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState("");
 const[message,setMessage]=useState("");
 const[error,setError]=useState("");
 const[expandedFlag,setExpandedFlag]=useState("");
 const[loadingEvidence,setLoadingEvidence]=useState("");
 const[evidenceByFlag,setEvidenceByFlag]=useState<Record<string,Evidence>>({});

 const load=useCallback(async()=>{
  if(!supabase){setError("Database connection is not ready.");setLoading(false);return;}
  setLoading(true);setError("");
  const[{data,error:e},{data:healthData,error:healthError}]=await Promise.all([
   supabase.rpc("admin_list_fraud_flags",{p_status:filter,p_limit:200}),
   supabase.rpc("admin_fraud_health")
  ]);
  if(e){setError(e.message||"Could not load fraud flags.");setFlags([]);}
  else setFlags((data?.flags||[]) as Flag[]);
  if(!healthError&&healthData)setHealth(healthData as Health);
  setLoading(false);
 },[filter]);
 useEffect(()=>{void load()},[load]);

 async function viewEvidence(id:string){
  if(expandedFlag===id){setExpandedFlag("");return;}
  setExpandedFlag(id);
  if(evidenceByFlag[id]||!supabase)return;
  setLoadingEvidence(id);setError("");
  const{data,error:e}=await supabase.rpc("admin_get_fraud_flag_evidence",{p_flag_id:id});
  if(e)setError(e.message||"Could not load evidence for this flag.");
  else setEvidenceByFlag(current=>({...current,[id]:data as Evidence}));
  setLoadingEvidence("");
 }

 async function resolve(id:string,status:"reviewing"|"resolved"|"dismissed"){
  if(!supabase)return;
  setBusy(id);setError("");setMessage("");
  const{error:e}=await supabase.rpc("admin_resolve_fraud_flag",{p_flag_id:id,p_resolution:status});
  if(e)setError(e.message||"Could not update this review.");
  else{setMessage("Flag moved to "+status+".");await load();}
  setBusy("");
 }

 return <main className="formPage">
  <Link href="/admin" className="back">← Admin</Link>
  <div className="formCard wide">
   <span className="eyebrow">ADMIN · TRUST & SAFETY</span>
   <h1>Fraud <em>review queue.</em></h1>
   <p>Review suspicious clicks, impressions, video playback, installs and conversions across social creators, websites and apps. A tracking-link click is never counted as a video view. Flags trigger payment holds and investigation, not automatic punishment.</p>
   <div className="statsGrid">
    <div><b>Events assessed · 24h</b><strong>{loading?"—":health.events_24h}</strong><small>All monitored event sources</small></div>
    <div><b>Verified events · 24h</b><strong>{loading?"—":health.verified_24h}</strong><small>Trusted source + evidence</small></div>
    <div><b>Open fraud flags</b><strong>{loading?"—":health.open_flags}</strong><small>Open or under investigation</small></div>
    <div><b>Review queue</b><strong>{loading?"—":health.review_queue}</strong><small>Needs investigation</small></div>
    <div><b>Blocked · 24h</b><strong>{loading?"—":health.blocked_24h}</strong><small>High-risk activity</small></div>
    <div><b>Verified payable · 24h</b><strong>{loading?"—":health.payable_24h}</strong><small>Eligible for settlement only after budget/hold checks</small></div>
    <div><b>Tracked clicks · 24h</b><strong>{loading?"—":health.click_events_24h}</strong><small>Proxy-verified unique clicks</small></div>
    <div><b>Publisher events · 24h</b><strong>{loading?"—":health.publisher_events_24h}</strong><small>Website and app telemetry</small></div>
    <div><b>Metric checks · 24h</b><strong>{loading?"—":health.metric_checks_24h}</strong><small>Platform API view counts</small></div>
    <div><b>Conversion events · 24h</b><strong>{loading?"—":health.conversion_events_24h}</strong><small>Verified postbacks</small></div>
   </div>
   <div className="infoBox"><b>Fraud scoring and payment holds</b><p>Automation/headless signals score 70+ (blocked). Shared IP velocity of 15 clicks in 10 minutes and visitor velocity of 20 in 10 minutes score for review; 50 visitor events or 60 IP events score critical. Viewability requires rendered, at least 50% in view and 1 second visible. Video playback events require playback evidence; platform API metrics are assessed for abnormal growth. CPM and CPC payout functions now require low-risk verified assessments and no open fraud hold.</p></div>
   <div className="choiceRow">{(["open","reviewing","resolved","dismissed","all"] as Status[]).map(s=><button key={s} className={filter===s?"primary":"secondary"} onClick={()=>setFilter(s)}>{s[0].toUpperCase()+s.slice(1)}</button>)}</div>
   {error&&<div className="successBox" role="alert">{error}</div>}
   {message&&<div className="successBox">✓ {message}</div>}
   {loading?<div className="successBox">Loading fraud flags…</div>:flags.length?<div className="opps">
    {flags.map(f=><article key={f.id}>
     <div className="formatBadgeRow"><span className="formatBadge">{f.severity.toUpperCase()} · SCORE {f.score}</span><span className="formatBadge">{f.status.toUpperCase()}</span></div>
     <h3>{f.flag_type.replaceAll("_"," ")}</h3><p>{f.reason}</p>
     <small>Publisher account: {f.creator_id}</small><br/><small>Campaign: {f.campaign_id}</small><br/><small>{new Date(f.created_at).toLocaleString()}</small>
     <div className="choiceRow">
      <button className="secondary" disabled={!!loadingEvidence&&loadingEvidence!==f.id} onClick={()=>void viewEvidence(f.id)}>{expandedFlag===f.id?"Hide evidence":"View event evidence"}</button>
      {f.status!=="resolved"&&f.status!=="dismissed"&&<>
       <button className="secondary" disabled={!!busy} onClick={()=>void resolve(f.id,"reviewing")}>Mark reviewing</button>
       <button className="primary" disabled={!!busy} onClick={()=>void resolve(f.id,"resolved")}>{busy===f.id?"Saving…":"Resolve"}</button>
       <button className="secondary" disabled={!!busy} onClick={()=>void resolve(f.id,"dismissed")}>Dismiss</button>
      </>}
     </div>
     {expandedFlag===f.id&&<div className="infoBox">
      <b>Evidence and payment context</b>
      {loadingEvidence===f.id?<p>Loading linked event evidence…</p>:evidenceByFlag[f.id]?<>
       <p><b>Campaign:</b> {evidenceByFlag[f.id].campaign_name||f.campaign_id}</p>
       <h3>Assessed events ({evidenceByFlag[f.id].events?.length||0})</h3>
       {evidenceByFlag[f.id].events?.length?evidenceByFlag[f.id].events.map((event,index)=><div key={event.source_row_id+index}>
        <p><b>{event.event_type.replaceAll("_"," ")} · {event.source_table}</b> — score {event.risk_score}, {event.risk_status}</p>
        <small>{event.verification_status} · {event.verified?"verified":"not verified"} · {event.payable?"payable":"not payable"} · {new Date(event.created_at).toLocaleString()}</small>
        <p>{(event.risk_reasons||[]).join(", ")||"No additional risk reasons recorded"}</p>
        <details><summary>Technical evidence and correlation hashes</summary><pre>{JSON.stringify({signals:event.evidence,ip_hash:event.ip_hash,visitor_hash:event.visitor_hash,session_hash:event.session_hash,user_agent_hash:event.user_agent_hash},null,2)}</pre></details>
       </div>):<p>No matching assessed events were found in the investigation window.</p>}
       <h3>Related creator payments ({evidenceByFlag[f.id].payments?.length||0})</h3>
       {evidenceByFlag[f.id].payments?.length?evidenceByFlag[f.id].payments.map(payment=><p key={payment.id}><b>{money(payment.amount)}</b> · {payment.status} · {new Date(payment.created_at).toLocaleString()}</p>):<p>No creator-payment ledger entries were found in the investigation window.</p>}
      </>:null}
     </div>}
    </article>)}
   </div>:<div className="successBox">No {filter==="all"?"":filter+" "}fraud flags found.</div>}
  </div>
 </main>;
}
