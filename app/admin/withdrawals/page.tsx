"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type PayoutDetails={payout_method:string;country_code:string;currency_code:string;account_holder?:string|null;bank_name?:string|null;account_number?:string|null;routing_code?:string|null;swift_bic?:string|null;iban?:string|null;mobile_money_provider?:string|null;mobile_number?:string|null;wise_email?:string|null;paypal_email?:string|null};
type Withdrawal={id:string;creator_id:string;display_name?:string|null;account_role?:string|null;payout_details?:PayoutDetails|null;amount:number;amount_usd?:number|null;fx_rate_to_usd?:number|null;minimum_usd?:number|null;status:string;created_at:string;payment_reference?:string|null;payment_note?:string|null;paid_at?:string|null};
type AuditEvent={id:string;actor_id:string|null;previous_status:string|null;new_status:string;amount:number;created_at:string;payment_reference?:string|null;event_note?:string|null};
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
 const [paymentReference,setPaymentReference]=useState<Record<string,string>>({});
 const [paymentNote,setPaymentNote]=useState<Record<string,string>>({});

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
  const reference=paymentReference[id]?.trim()||"";
  if(status==="paid"&&reference.length<3){setError("Enter the external transfer reference (at least 3 characters) before marking paid.");return}
  const promptText=status==="paid"?"Confirm that the external transfer has actually been completed. The reference will be saved in the audit trail.":"";
  if(promptText&&!window.confirm(promptText))return;
  setBusy(id);setError("");setMessage("");
  const {data,error:e}=await supabase.rpc("admin_update_creator_withdrawal",{p_withdrawal_id:id,p_new_status:status,p_payment_reference:status==="paid"?reference:null,p_payment_note:status==="paid"?(paymentNote[id]?.trim()||null):null});
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
    <b>{r.status.toUpperCase()}</b><h3>{money(r.amount)}</h3>{r.amount_usd!=null&&<p>USD value: ${Number(r.amount_usd).toFixed(2)} · FX snapshot: {r.fx_rate_to_usd}</p>}
    <p>{r.account_role==="publisher"?"Publisher":"Creator"}: {r.display_name||r.creator_id}</p><small>{new Date(r.created_at).toLocaleString()} · Request {r.id}</small>{r.payout_details?<div className="infoBox"><b>PAYOUT DESTINATION · {r.payout_details.country_code} · {r.payout_details.currency_code}</b>{r.payout_details.payout_method==="bank_transfer"?<><p>Account holder: {r.payout_details.account_holder}</p><p>Bank: {r.payout_details.bank_name}</p><p>Account number: {r.payout_details.account_number}</p>{r.payout_details.routing_code&&<p>Routing / sort code: {r.payout_details.routing_code}</p>}{r.payout_details.swift_bic&&<p>SWIFT / BIC: {r.payout_details.swift_bic}</p>}{r.payout_details.iban&&<p>IBAN: {r.payout_details.iban}</p>}</>:r.payout_details.payout_method==="wise"?<p>Wise account email: {r.payout_details.wise_email}</p>:r.payout_details.payout_method==="paypal"?<p>PayPal account email: {r.payout_details.paypal_email}</p>:<><p>Provider: {r.payout_details.mobile_money_provider}</p><p>Mobile number: {r.payout_details.mobile_number}</p></>}<small>Private payout data · admin only</small></div>:<div className="successBox">No payout destination saved. Ask the user to add payout details before processing.</div>}
    {r.status==="approved"&&<div className="infoBox"><b>RECORD EXTERNAL PAYMENT</b><p>Send the money using your bank, Wise or PayPal outside AdBridge. Enter the transfer reference below only after the transfer succeeds.</p><label>Transfer reference / transaction ID *</label><input className="textInput" value={paymentReference[r.id]||""} onChange={e=>setPaymentReference(v=>({...v,[r.id]:e.target.value}))} placeholder="Bank reference, Wise ID or PayPal transaction ID"/><label>Admin note (optional)</label><input className="textInput" value={paymentNote[r.id]||""} onChange={e=>setPaymentNote(v=>({...v,[r.id]:e.target.value}))} placeholder="Optional payment note"/></div>}
    {r.status==="paid"&&<div className="infoBox"><b>PAYMENT RECORDED</b><p>Reference: {r.payment_reference||"Not available"}</p>{r.paid_at&&<p>Paid at: {new Date(r.paid_at).toLocaleString()}</p>}{r.payment_note&&<p>Note: {r.payment_note}</p>}</div>}
    <div className="choiceRow">
     <button className="secondary" onClick={()=>void loadAudit(r.id)}>Audit history</button>
     {r.status==="pending"&&<><button className="primary" disabled={!!busy} onClick={()=>void update(r.id,"approved")}>{busy===r.id?"Saving…":"Approve"}</button><button className="secondary" disabled={!!busy} onClick={()=>void update(r.id,"rejected")}>Reject</button></>}
     {r.status==="approved"&&<button className="primary" disabled={!!busy} onClick={()=>void update(r.id,"paid")}>{busy===r.id?"Saving…":"Mark paid"}</button>}
    </div>
    {selected===r.id&&<div className="infoBox"><b>STATUS AUDIT TRAIL</b>{events.length?events.map(ev=><p key={ev.id}>{ev.previous_status||"created"} → {ev.new_status} · {money(ev.amount)} · {new Date(ev.created_at).toLocaleString()} · Actor: {ev.actor_id||"system"}{ev.payment_reference&&<><br/>Reference: {ev.payment_reference}</>}{ev.event_note&&<><br/>Note: {ev.event_note}</>}</p>):<small>No status changes have been recorded yet.</small>}</div>}
   </article>)}</div>:<div className="successBox">No {filter==="all"?"":filter+" "}withdrawal requests.</div>}
  </div>
 </main>
}