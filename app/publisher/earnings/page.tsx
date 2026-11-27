"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Payment={id:string;amount:number|null;type:string|null;status:string|null;created_at:string;campaigns?:{name:string}|{name:string}[]|null};
type Withdrawal={id:string;amount:number;status:string;created_at:string};
type Summary={released_earnings:number;held_earnings:number;withdrawals_pending:number;withdrawals_approved:number;withdrawals_paid:number;available_balance:number;minimum_withdrawal_usd:number;minimum_withdrawal_ngn:number|null;usd_to_ngn_rate:number|null};

const money=(n:number)=>"₦"+Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2});

export default function PublisherEarnings(){
 const[payments,setPayments]=useState<Payment[]>([]);
 const[withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
 const[summary,setSummary]=useState<Summary|null>(null);
 const[amount,setAmount]=useState("");
 const[message,setMessage]=useState("");
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase){setMessage("AdBridge database is not connected.");setLoading(false);return;}
  const{data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){window.location.href="/login";return;}
  const[p,w,s]=await Promise.all([
   supabase.from("campaign_payments").select("id,amount,type,status,created_at,campaigns(name)").eq("creator_id",user.id).eq("type","creator_payment").order("created_at",{ascending:false}),
   supabase.from("creator_withdrawals").select("id,amount,status,created_at").eq("creator_id",user.id).order("created_at",{ascending:false}),
   supabase.rpc("get_creator_earnings_summary")
  ]);
  if(p.error||w.error||s.error)setMessage("Some earnings information could not be loaded. Refresh and try again.");
  setPayments((p.data||[]) as Payment[]);setWithdrawals((w.data||[]) as Withdrawal[]);
  if(!s.error)setSummary(s.data as Summary);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 async function requestWithdrawal(){
  if(!supabase)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0){setMessage("Enter a valid positive withdrawal amount.");return;}
  if(value>Number(summary?.available_balance||0)){setMessage("That amount is greater than your available balance.");return;}
  setBusy(true);setMessage("");
  const{error}=await supabase.rpc("request_creator_withdrawal",{p_amount:value});
  setBusy(false);
  if(error){setMessage(error.message||"Your withdrawal request could not be submitted.");return;}
  setAmount("");setMessage("Withdrawal request submitted for review.");setLoading(true);await load();
 }
 return <main className="formPage">
  <Link href="/publisher" className="back">← Publisher Dashboard</Link>
  <div className="formCard wide">
   <span className="eyebrow">PUBLISHER EARNINGS</span>
   <h1>Your inventory. Your <em>earnings.</em></h1>
   <p>See verified website and app delivery earnings, amounts held for review and withdrawal activity.</p>
   {loading?<div className="successBox">Loading your earnings…</div>:<div className="statsGrid">
    <div><b>AVAILABLE TO WITHDRAW</b><strong>{money(summary?.available_balance||0)}</strong></div>
    <div><b>RELEASED EARNINGS</b><strong>{money(summary?.released_earnings||0)}</strong></div>
    <div><b>HELD FOR REVIEW</b><strong>{money(summary?.held_earnings||0)}</strong></div>
    <div><b>ALREADY PAID OUT</b><strong>{money(summary?.withdrawals_paid||0)}</strong></div>
   </div>}
   <div className="infoBox"><b>Payout destination</b><p>Save or update the bank, mobile-money or supported international payout destination for approved withdrawals.</p><Link href="/creator/payout-details">Manage payout details →</Link></div>
   <label>Withdrawal amount</label>
   <p className="muted">Minimum: ${summary?.minimum_withdrawal_usd||50} {summary?.minimum_withdrawal_ngn?`(about ${money(summary.minimum_withdrawal_ngn)})`:"· FX rate awaiting administrator setup"}. First successful withdrawal: $50; later withdrawals: $20. AdBridge pays withdrawal charges.</p>
   <input className="textInput" type="number" min={summary?.minimum_withdrawal_ngn||1} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₦ 0" inputMode="decimal"/>
   <button className="primary" disabled={busy||loading||!summary?.available_balance||!summary?.usd_to_ngn_rate} onClick={()=>void requestWithdrawal()}>{busy?"Submitting…":"Request withdrawal →"}</button>
   {message&&<div className="successBox" role="status">{message}</div>}
   <h2>Payment history</h2>
   {payments.length?<div className="opps">{payments.map(p=>{const c=Array.isArray(p.campaigns)?p.campaigns[0]:p.campaigns;return <article key={p.id}><b>{(p.status||"pending").toUpperCase()}</b><h3>{c?.name||"Publisher campaign payment"}</h3><p>{(p.type||"payment").replaceAll("_"," ")} · {new Date(p.created_at).toLocaleDateString()}</p><strong>{money(Number(p.amount||0))}</strong></article>})}</div>:<div className="successBox">No publisher payments yet. Verified delivery payments will appear here.</div>}
   <h2>Withdrawal history</h2>
   {withdrawals.length?<div className="opps">{withdrawals.map(w=><article key={w.id}><b>{w.status.toUpperCase()}</b><h3>{money(w.amount)}</h3><small>{new Date(w.created_at).toLocaleString()}</small></article>)}</div>:<div className="successBox">No withdrawal requests yet.</div>}
   <p><small>Only server-verified publisher events that pass fraud checks and campaign budget rules qualify for payment. A click or unverified browser event alone does not qualify as a payable view.</small></p>
  </div>
 </main>;
}
