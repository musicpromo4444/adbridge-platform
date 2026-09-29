"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";
import {supabase} from "@/lib/supabase";

export default function Submit(){
 const p=useSearchParams();const job=p.get("job")||"";
 const [posted,setPosted]=useState("");const [evidence,setEvidence]=useState("");const [note,setNote]=useState("");const [platform,setPlatform]=useState("TikTok");
 const [sent,setSent]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 async function submit(){
  if(!supabase||!job){setError("Open this page from an accepted campaign.");return}
  if(!posted.trim()){setError("Paste the link to your published work.");return}
  setSaving(true);setError("");
  const {data:jc,error:je}=await supabase.from("creator_campaigns").select("id,campaign_id,creator_id").eq("id",job).single();
  if(je||!jc){setError("Campaign job not found.");setSaving(false);return}
  const {data:campaign,error:ce}=await supabase.from("campaigns").select("payment_method,desired_results,platform").eq("id",jc.campaign_id).single();
  if(ce||!campaign){setError("Campaign details could not be loaded.");setSaving(false);return}
  const trackingPlatform=platform.toLowerCase();
  const targetMetric=["views","cpm"].includes(String(campaign.payment_method).toLowerCase())?Number(campaign.desired_results||0):null;
  const {error:e}=await supabase.from("submissions").insert({
   campaign_id:jc.campaign_id,creator_id:jc.creator_id,creator_campaign_id:jc.id,
   posted_url:posted.trim(),note,status:"waiting",tracking_platform:trackingPlatform,
   target_metric:targetMetric,current_metric:0,metric_status:targetMetric?"pending":"not_required"
  });
  if(e){setError(e.message||"Submission failed.");setSaving(false);return}
  await supabase.from("creator_campaigns").update({status:"submitted"}).eq("id",job);
  setSent(true);setSaving(false)
 }
 return <main className="formPage"><Link href="/creator/work" className="back">← My Work</Link><div className="formCard"><span className="eyebrow">SEND COMPLETED WORK</span><h1>Ready to <em>submit?</em></h1><p>Submit the public link. AdBridge will track campaign results where the platform provides verified metrics.</p>
 <label>Platform</label><select className="textInput" value={platform} onChange={e=>setPlatform(e.target.value)}><option>TikTok</option><option>YouTube</option><option>Instagram</option><option>Facebook</option><option>X</option><option>Snapchat</option></select>
 <label>Posted work link</label><input className="textInput" value={posted} onChange={e=>setPosted(e.target.value)} placeholder="https://tiktok.com/..."/>
 {platform==="Snapchat"&&<><label>Evidence / Insights link (Snapchat)</label><input className="textInput" value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Paste your Snapchat Insights evidence link"/></>}<label>Anything the advertiser should know?</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/>
 {error&&<div className="successBox">{error}</div>}<button className="primary" disabled={saving||sent} onClick={submit}>{saving?"Sending…":sent?"Sent for approval ✓":"Send for approval →"}</button>
 {sent&&<><div className="successBox"><b>Submission received.</b><br/>For view-based campaigns, AdBridge will keep checking the published video until the agreed target is reached and verified.</div><Link className="secondary" href="/creator/work">Back to my work →</Link></>}
 </div></main>
}