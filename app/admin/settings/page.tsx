"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

export default function Settings(){
 const [allow,setAllow]=useState(true),[verify,setVerify]=useState(false),[commission,setCommission]=useState("10"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{async function load(){if(!supabase){setError("Database connection is not ready.");setLoading(false);return}const {data,error:e}=await supabase.from("platform_settings").select("*").eq("id",1).maybeSingle();if(e)setError("We couldn't load platform settings.");if(data){setAllow(data.allow_new_campaigns);setVerify(data.require_creator_verification);setCommission(String(data.platform_commission??10))}setLoading(false)}load()},[]);
 async function save(){if(!supabase)return;setSaving(true);setError("");setMessage("");const {error:e}=await supabase.from("platform_settings").upsert({id:1,allow_new_campaigns:allow,require_creator_verification:verify,platform_commission:Number(commission)||0,updated_at:new Date().toISOString()},{onConflict:"id"});if(e)setError("We couldn't save settings.");else setMessage("Platform settings saved.");setSaving(false)}
 if(loading)return <main className="formPage"><div className="formCard"><h1>Loading settings…</h1></div></main>;
 return <main className="formPage"><Link href="/admin" className="back">← Admin</Link><div className="formCard"><span className="eyebrow">ADMIN · SETTINGS</span><h1>Platform <em>controls.</em></h1><p>These controls affect how the marketplace operates.</p>
 <label>Allow new campaigns</label><div className="choices compact"><button type="button" className={allow?"selected":""} onClick={()=>setAllow(true)}>On</button><button type="button" className={!allow?"selected":""} onClick={()=>setAllow(false)}>Off</button></div>
 <label>Require creator verification</label><div className="choices compact"><button type="button" className={verify?"selected":""} onClick={()=>setVerify(true)}>Yes</button><button type="button" className={!verify?"selected":""} onClick={()=>setVerify(false)}>No</button></div>
 <label>Platform commission (%)</label><input className="textInput" inputMode="decimal" value={commission} onChange={e=>setCommission(e.target.value)} placeholder="10"/>
 {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
 <button className="primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save settings"}</button></div></main>
}