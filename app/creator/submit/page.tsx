"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";
import {supabase} from "@/lib/supabase";
export default function Submit(){
 const p=useSearchParams();const job=p.get("job")||"";const [posted,setPosted]=useState("");const [note,setNote]=useState("");const [sent,setSent]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 async function submit(){if(!supabase||!job){setError("Open this page from an accepted campaign.");return}if(!posted.trim()){setError("Paste the link to your published work.");return}setSaving(true);setError("");const {data:jc,error:je}=await supabase.from("creator_campaigns").select("id,campaign_id,creator_id").eq("id",job).single();if(je||!jc){setError("Campaign job not found.");setSaving(false);return}const {error:e}=await supabase.from("submissions").insert({campaign_id:jc.campaign_id,creator_id:jc.creator_id,creator_campaign_id:jc.id,posted_url:posted.trim(),note,status:"waiting"});if(e){setError(e.message||"Submission failed.");setSaving(false);return}await supabase.from("creator_campaigns").update({status:"submitted"}).eq("id",job);setSent(true);setSaving(false)}
 return <main className="formPage"><Link href="/creator/work" className="back">← My Work</Link><div className="formCard"><span className="eyebrow">SEND COMPLETED WORK</span><h1>Ready to <em>submit?</em></h1><p>Submit the public link to your completed campaign work for advertiser review.</p><label>Posted work link</label><input className="textInput" value={posted} onChange={e=>setPosted(e.target.value)} placeholder="https://tiktok.com/..."/>
 <label>Anything the advertiser should know?</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/>
 {error&&<div className="successBox">{error}</div>}<button className="primary" disabled={saving||sent} onClick={submit}>{saving?"Sending…":sent?"Sent for approval ✓":"Send for approval →"}</button>{sent&&<><div className="successBox">Your submission is now waiting for advertiser review.</div><Link className="secondary" href="/creator/work">Back to my work →</Link></>}</div></main>
}