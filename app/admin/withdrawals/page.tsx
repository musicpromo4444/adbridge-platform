"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
export default function Withdrawals(){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function load(){if(!supabase)return;const {data,error:e}=await supabase.from("creator_withdrawals").select("*").order("created_at",{ascending:false});if(e)setError("Could not load withdrawal requests.");setRows(data||[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 async function update(id:string,status:"approved"|"rejected"){if(!supabase)return;setBusy(id);setError("");const {error:e}=await supabase.from("creator_withdrawals").update({status}).eq("id",id);if(e)setError("Could not update this request.");else{setMessage("Withdrawal "+status+".");await load()}setBusy("")}
 return <main className="formPage"><Link href="/admin" className="back">← Admin</Link><div className="formCard wide"><span className="eyebrow">ADMIN · WITHDRAWALS</span><h1>Creator <em>withdrawals.</em></h1><p>Review payout requests and keep the payout queue under control.</p>{error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}{loading?<div className="successBox">Loading requests…</div>:<div className="opps">{rows.map(r=><article key={r.id}><b>{String(r.status).toUpperCase()}</b><h3>₦{Number(r.amount||0).toLocaleString()}</h3><p>Creator: {r.creator_id}</p><small>{new Date(r.created_at).toLocaleString()}</small>{r.status==="pending"&&<div className="choiceRow"><button className="primary" disabled={!!busy} onClick={()=>update(r.id,"approved")}>{busy===r.id?"Saving…":"Approve"}</button><button className="secondary" disabled={!!busy} onClick={()=>update(r.id,"rejected")}>Reject</button></div>}</article>)}{!rows.length&&<div className="successBox">No withdrawal requests yet.</div>}</div>}</div></main>
}