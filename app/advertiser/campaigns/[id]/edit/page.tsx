"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;instructions:string|null;platform:string|null;payment_method:string|null;payment_rate:number|null;max_budget:number|null;desired_results:number|null;status:string};
const methods=[["job","Creator post/job"],["views","Views"],["clicks","Website visits"],["installs","App installs"],["actions","Sign-ups or purchases"],["placement","Product placement"]];

export default function EditCampaign(){
 const {id}=useParams<{id:string}>(); const [c,setC]=useState<Campaign|null>(null);
 const [name,setName]=useState(""),[instructions,setInstructions]=useState(""),[platform,setPlatform]=useState("TikTok"),[method,setMethod]=useState("job"),[rate,setRate]=useState(""),[budget,setBudget]=useState(""),[results,setResults]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{async function load(){if(!supabase){setError("Database connection is not ready.");setLoading(false);return}const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/login";return}const {data,error:e}=await supabase.from("campaigns").select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget,desired_results,status").eq("id",id).eq("advertiser_id",user.id).single();if(e||!data){setError("Campaign not found.");setLoading(false);return}setC(data);setName(data.name);setInstructions(data.instructions||"");setPlatform(data.platform||"TikTok");setMethod(data.payment_method||"job");setRate(String(data.payment_rate??0));setBudget(String(data.max_budget??0));setResults(String(data.desired_results??0));setLoading(false)}load()},[id]);
 async function save(){if(!supabase||!c)return;if(!name.trim()||!instructions.trim()){setError("Campaign name and creator instructions are required.");return}setSaving(true);setError("");setMessage("");const {error:e}=await supabase.from("campaigns").update({name:name.trim(),instructions:instructions.trim(),platform,payment_method:method,payment_rate:Number(rate)||0,max_budget:Number(budget)||0,desired_results:Number(results.replaceAll(",",""))||0,updated_at:new Date().toISOString()}).eq("id",id);if(e)setError("We couldn't save the campaign.");else setMessage("Campaign updated successfully.");setSaving(false)}
 if(loading)return <main className="formPage"><div className="formCard"><h1>Loading campaign…</h1></div></main>;
 if(error&&!c)return <main className="formPage"><Link href="/advertiser/campaigns" className="back">← Campaigns</Link><div className="formCard"><div className="successBox">{error}</div></div></main>;
 return <main className="formPage"><Link href="/advertiser/campaigns" className="back">← Campaigns</Link><div className="formCard wide"><span className="eyebrow">EDIT CAMPAIGN</span><h1>Update your <em>campaign.</em></h1><p>Changes are saved directly to the live campaign.</p>{c&&<div className="infoBox"><b>Status: {c.status}</b><p>Campaign goal: {c.goal}</p></div>}
 <label>Campaign name</label><input className="textInput" value={name} onChange={e=>setName(e.target.value)}/><label>Creator instructions</label><textarea value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Tell creators exactly what to do."/>
 <label>Platform</label><div className="choices compact">{["TikTok","Instagram","YouTube","Facebook"].map(x=><button type="button" key={x} className={platform===x?"selected":""} onClick={()=>setPlatform(x)}>{x}</button>)}</div>
 <label>Payment model</label><div className="choices compact">{methods.map(([m,title])=><button type="button" key={m} className={method===m?"selected":""} onClick={()=>setMethod(m)}>{title}</button>)}</div>
 <div className="formGrid"><div><label>Payment rate</label><input className="textInput" value={rate} onChange={e=>setRate(e.target.value)} inputMode="decimal"/></div><div><label>Maximum budget</label><input className="textInput" value={budget} onChange={e=>setBudget(e.target.value)} inputMode="decimal"/></div></div>
 <label>Desired results</label><input className="textInput" value={results} onChange={e=>setResults(e.target.value)} inputMode="numeric"/>
 {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
 <div className="choiceRow"><button className="primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save changes"}</button><Link className="secondary" href={"/advertiser/results?campaign="+id}>View results</Link></div>
 </div></main>;
}