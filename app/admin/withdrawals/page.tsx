"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Withdrawal={id:string;creator_id:string;amount:number;status:string;created_at:string};
type AuditEvent={id:string;actor_id:string|null;previous_status:string|null;new_status:string;amount:number;created_at:string};
type Filter="pending"|"approved"|"paid"|"rejected"|"all";

export default function Withdrawals(){
 const [rows,setRows]=useState<Withdrawal[]>([]);
 const [filter,setFilter]=useState<Filter>("pending");
 const [events,setEvents]=useState<AuditEvent[]>([]);
 const [selected,setSelected]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 const load=useCallback(async()=>{
  if(!supabase){setError("Database connection is not ready.");setLoading(false);return}
  setLoading(true);setError("");
  const {data,error:e}=await supabase.rpc("admin_list_creator_withdrawals",{p_status:filter,p_limit:150});
  if(e){setError(e.message||"Could not load withdrawal requests.");setRows([])}
  else setRows((data?.withdrawals||[]) as Withdrawal[]);
  setLoading(false);
 },[filter]);
 useEffect(()=>{void load()},[load]);

 async function loadAudit(id:string){
  if(!supabase)return;
  setSelected(id);setEvents([]);
  const {data,error:e}=await supabase.rpc("admin_list_withdrawal_events",{p_withdrawal_id:id,p_limit:50});
  if(e){setError(e.message||"Could not load audit history.");return}
  setEvents((data?.events||[]) as AuditEvent[]);
 }
 async function update(id:string,status:"approved"|"rejected"|"paid"){
  if(!supabase)return;
  const promptText=status==="paid"?"Confirm that the bank transfer has actually been completed before marking this withdrawal paid.":"";
  if(promptText&&!window.confirm(promptText))return;
  setBusy(id);setError("");setMessage("");
  const {data,error:e}=await supabase.rpc("admin_update_creator_withdrawal",{p_withdrawal_id:id,p_new_status:status});
  if(e){setError(e.message||"Could not update this withdrawal.");setBusy("") ;return}
  setMessage("Withdrawal status changed to "+status+".");
  await load();
  if(selected===id)await loadAudit(id);
  setBusy("");
 }
 const money=(n:number)=>"₦"+Number(n||0).toLocaleString();
 return <main className="formPage">
  <Link href="/admin" className="back">← Admin</Link>
  <div className="formCard wide">
   <span className="eyebrow">ADMIN · WITHDRAWAL CONTROL</span>
   <h1>Creator <em>withdrawals.</em></h1>
   <p>Review requests through protected admin actions. Approve or reject pending requests; mark an approved request paid only after the actual transfer is complete.</p>
   <div className="choiceRow">{(["pending","approved","paid","rejected","all"] as Filter[]).map(x=><button key={x} className={filter===x?"primary":"secondary"} onClick={()=>setFilter(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>
   {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
   {loading?<div className="successBox">Loading withdrawal requests…</div>:rows.length?<div className="opps">{rows.map(r=><article key={r.id}>
    <b>{r.status.toUpperCase()}</b><h3>{money(r.amount)}</h3>
    <p>Creator account: {r.creator_id}</p><small>{new Date(r.created_at).toLocaleString()} · Request {r.id}</small>
    <div className="choiceRow">
     <button className="secondary" onClick={()=>void loadAudit(r.id)}>Audit history</button>
     {r.status==="pending"&&<><button className="primary" disabled={!!busy} onClick={()=>void update(r.id,"approved")}>{busy===r.id?"Saving…":"Approve"}</button><button className="secondary" disabled={!!busy} onClick={()=>void update(r.id,"rejected")}>Reject</button></>}
     {r.status==="approved"&&<button className="primary" disabled={!!busy} onClick={()=>void update(r.id,"paid")}>{busy===r.id?"Saving…":"Mark paid"}</button>}
    </div>
    {selected===r.id&&<div className="infoBox"><b>STATUS AUDIT TRAIL</b>{events.length?events.map(ev=><p key={ev.id}>{ev.previous_status||"created"} → {ev.new_status} · {money(ev.amount)} · {new Date(ev.created_at).toLocaleString()} · Actor: {ev.actor_id||"system"}</p>):<small>No status changes have been recorded yet.</small>}</div>}
   </article>)}</div>:<div className="successBox">No {filter==="all"?"":filter+" "}withdrawal requests.</div>}
  </div>
 </main>
}