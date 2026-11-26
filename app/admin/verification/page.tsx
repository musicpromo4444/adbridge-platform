"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
type Submission={id:string;creator_id:string;platform:string;post_type:string;post_url:string;note:string|null;status:string;admin_note:string|null;created_at:string;profiles?:{display_name:string|null;email:string|null;verified:boolean}[]|null};
export default function AdminCreatorVerification(){
 const[rows,setRows]=useState<Submission[]>([]),[filter,setFilter]=useState("pending"),[platformFilter,setPlatformFilter]=useState("all"),[busy,setBusy]=useState(""),[note,setNote]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function load(){
  if(!supabase){setError("Database connection is not ready.");setLoading(false);return}
  setLoading(true);setError("");const{data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){location.href="/login";return}
  const{data:p,error:pe}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();if(pe||p?.role!=="admin"){setError("Administrator access required.");setLoading(false);return}
  const{data,error:e}=await supabase.from("creator_verification_submissions").select("id,creator_id,platform,post_type,post_url,note,status,admin_note,created_at,profiles(display_name,email,verified)").order("created_at",{ascending:false});
  if(e)setError("Verification queue could not be loaded. Refresh to retry.");setRows((data||[]) as Submission[]);setLoading(false)
 }
 useEffect(()=>{void load()},[]);
 const counts=useMemo(()=>({pending:rows.filter(r=>r.status==="pending").length,approved:rows.filter(r=>r.status==="approved").length,rejected:rows.filter(r=>r.status==="rejected").length,verified:new Set(rows.filter(r=>r.profiles?.[0]?.verified).map(r=>r.creator_id)).size}),[rows]);
 const filtered=rows.filter(r=>(filter==="all"||r.status===filter)&&(platformFilter==="all"||r.platform===platformFilter));
 async function decide(r:Submission,status:"approved"|"rejected"){
  if(!supabase)return;const adminNote=note[r.id]?.trim()||null;if(status==="rejected"&&!adminNote){setError("Add a clear rejection reason before rejecting a post.");return}
  setBusy(r.id);setError("");setMessage("");const{data,error:e}=await supabase.rpc("admin_review_creator_verification",{p_submission_id:r.id,p_status:status,p_admin_note:adminNote});
  if(e){setError(e.message);setBusy("");return}
  setMessage(status==="approved"?"Creator approved, verified and notified.":"Submission rejected with feedback sent.");await load();setBusy("");
 }
 return <main className="formPage"><Link href="/admin" className="back">← Admin Dashboard</Link><div className="formCard wide"><span className="eyebrow">ADMIN · CREATOR VERIFICATION</span><h1>Review creator <em>promotions.</em></h1><p>Check the public post to ensure it is live, relevant and genuinely promotes AdBridge. Approval verifies the creator listing and notifies the creator; rejection requires a reason.</p>
 <div className="statsGrid"><div><b>PENDING</b><strong>{loading?"—":counts.pending}</strong></div><div><b>APPROVED</b><strong>{loading?"—":counts.approved}</strong></div><div><b>REJECTED</b><strong>{loading?"—":counts.rejected}</strong></div><div><b>VERIFIED CREATORS IN QUEUE</b><strong>{loading?"—":counts.verified}</strong></div></div>
 <div className="choiceRow"><button className="secondary" onClick={()=>void load()}>Refresh</button><select className="textInput" value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All submissions</option></select><select className="textInput" value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)}><option value="all">All platforms</option>{["instagram","tiktok","youtube","facebook","x","linkedin","snapchat","other"].map(p=><option value={p} key={p}>{p}</option>)}</select></div>
 {error&&<div className="successBox" role="alert">{error}</div>}{message&&<div className="successBox">{message}</div>}{loading&&<div className="successBox">Loading verification queue…</div>}
 {!loading&&filtered.map(r=><article className="infoBox" key={r.id}><b>{r.status.toUpperCase()} · {r.platform} · {r.post_type}</b><h3>{r.profiles?.[0]?.display_name||"Creator"}{r.profiles?.[0]?.verified?" · ✓ Already verified":""}</h3><p>{r.profiles?.[0]?.email||"No email"} · Submitted {new Date(r.created_at).toLocaleString()}</p><p>{r.note||"No extra details."}</p><a className="secondary" href={r.post_url} target="_blank" rel="noreferrer">Open public post ↗</a><p className="fieldHint">Creator profile: {r.creator_id}</p>{r.admin_note&&<div className="successBox">Previous admin note: {r.admin_note}</div>}{r.status==="pending"&&<><label>Review note {r.profiles?.verified?"(optional)":"(required for rejection)"}</label><textarea value={note[r.id]||""} onChange={e=>setNote(old=>({...old,[r.id]:e.target.value}))} placeholder="Explain any issue clearly so the creator can correct it."/><div className="choiceRow"><button className="primary" disabled={!!busy} onClick={()=>void decide(r,"approved")}>{busy===r.id?"Saving…":"Approve & verify creator"}</button><button className="secondary" disabled={!!busy} onClick={()=>void decide(r,"rejected")}>Reject with reason</button></div></>}</article>)}
 {!loading&&!filtered.length&&<div className="successBox">No submissions in this filter.</div>}</div></main>
}
