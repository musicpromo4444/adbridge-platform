"use client";
import Link from "next/link";
import{useCallback,useEffect,useState}from"react";
import{supabase}from"@/lib/supabase";
type Payment={id:string;amount:number|null;type:string|null;status:string|null;created_at:string;campaigns?:{name:string}[]|null};
type Withdrawal={id:string;amount:number;status:string;created_at:string};
type Summary={currency:string;released_earnings:number;held_earnings:number;withdrawals_pending:number;withdrawals_approved:number;withdrawals_paid:number;withdrawals_rejected:number;available_balance:number;minimum_withdrawal_usd:number;minimum_withdrawal_ngn:number|null;usd_to_ngn_rate:number|null;withdrawal_fee_paid_by:string};
export default function Earnings(){
 const[payments,setPayments]=useState<Payment[]>([]),[withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
 const[summary,setSummary]=useState<Summary|null>(null),[amount,setAmount]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase){setMessage("AdBridge database is not connected.");setLoading(false);return}
  const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}
  const[p,w,s]=await Promise.all([
   supabase.from("campaign_payments").select("id,amount,type,status,created_at,campaigns(name)").eq("creator_id",user.id).order("created_at",{ascending:false}),
   supabase.from("creator_withdrawals").select("id,amount,status,created_at").eq("creator_id",user.id).order("created_at",{ascending:false}),
   supabase.rpc("get_creator_earnings_summary")
  ]);
  if(p.error||w.error||s.error)setMessage("Some earnings information could not be loaded. Refresh and try again.");
  setPayments((p.data??[]) as Payment[]);setWithdrawals((w.data??[]) as Withdrawal[]);
  if(!s.error)setSummary(s.data as Summary);setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 async function requestWithdrawal(){
  if(!supabase)return setMessage("Database connection is not ready.");
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0)return setMessage("Enter a valid positive withdrawal amount.");
  if(value>Number(summary?.available_balance||0))return setMessage("That amount is greater than your available balance.");
  setBusy(true);setMessage("");
  const{error}=await supabase.rpc("request_creator_withdrawal",{p_amount:value});
  setBusy(false);
  if(error){setMessage(error.message||"Your withdrawal request could not be submitted.");return}
  setAmount("");setMessage("Withdrawal request submitted for review.");setLoading(true);await load();
 }
 const money=(n:number)=>"₦"+Number(n||0).toLocaleString();
 return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard wide">
  <span className="eyebrow">YOUR EARNINGS</span><h1>Your work. Your <em>money.</em></h1>
  {loading?<div className="successBox">Loading your earnings…</div>:<div className="statsGrid">
   <div><b>Available to withdraw</b><strong>{money(summary?.available_balance||0)}</strong></div>
   <div><b>Released earnings</b><strong>{money(summary?.released_earnings||0)}</strong></div>
   <div><b>Held for review</b><strong>{money(summary?.held_earnings||0)}</strong></div>
   <div><b>Already paid out</b><strong>{money(summary?.withdrawals_paid||0)}</strong></div>
  </div>}
  <label>How much do you want to withdraw?</label><p className="muted">Minimum: ${summary?.minimum_withdrawal_usd||50} {summary?.minimum_withdrawal_ngn?`(about ${money(summary.minimum_withdrawal_ngn)})`:"· FX rate awaiting administrator setup"}. AdBridge pays withdrawal charges.</p><input className="textInput" type="number" min={summary?.minimum_withdrawal_ngn||1} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₦ 0" inputMode="decimal"/>
  <button className="primary" onClick={requestWithdrawal} disabled={busy||loading||!summary?.usd_to_ngn_rate}>{busy?"Submitting…":"Request withdrawal →"}</button>
  {message&&<div className="successBox">{message}</div>}
  <h2>Payment history</h2>{loading?<div className="successBox">Loading payments…</div>:payments.length?<div className="opps">{payments.map(p=><article key={p.id}><b>{(p.status||"pending").toUpperCase()}</b><h3>{p.campaigns?.[0]?.name||"Creator payment"}</h3><p>{(p.type||"payment").replaceAll("_"," ")} · {new Date(p.created_at).toLocaleDateString()}</p><strong>{money(Number(p.amount||0))}</strong></article>)}</div>:<div className="successBox">No payments yet.</div>}
  <h2>Withdrawal history</h2>{withdrawals.length?<div className="opps">{withdrawals.map(w=><article key={w.id}><b>{w.status.toUpperCase()}</b><h3>{money(w.amount)}</h3><small>{new Date(w.created_at).toLocaleString()}</small></article>)}</div>:<div className="successBox">No withdrawal requests yet.</div>}
  <p><small>First successful withdrawal minimum: $50. Later withdrawals: $20 minimum. The USD/NGN rate is captured with each request; AdBridge pays withdrawal charges. Requests are reviewed by AdBridge. A status of “paid” should only appear after the transfer has actually been completed.</small></p>
 </div></main>
}