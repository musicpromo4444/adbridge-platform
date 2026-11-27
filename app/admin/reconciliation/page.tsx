"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Reconciliation={
  generated_at:string;
  issue_count:number;
  totals:Record<string,number>;
  campaigns:Array<{
    campaign_id:string;campaign_name:string;campaign_status:string;
    max_budget:number;campaign_funded_amount:number;ledger_funding:number;
    ledger_refunds:number;committed_creator_payouts:number;
    released_creator_payouts:number;funding_difference:number;payout_overrun:number;
    funding_records:number;payout_records:number;
  }>;
  issues:Array<{
    campaign_id:string;campaign_name:string;issue:string;
    funding_difference:number;payout_overrun:number;
  }>;
};

const money=(n:number)=>"₦"+Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2});
const label=(s:string)=>s.replaceAll("_"," ");

export default function FinancialReconciliation(){
  const[data,setData]=useState<Reconciliation|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const load=useCallback(async()=>{
    if(!supabase){setError("AdBridge database is not connected.");setLoading(false);return;}
    setLoading(true);setError("");
    const{data:result,error:queryError}=await supabase.rpc("admin_financial_reconciliation");
    if(queryError){setError(queryError.message||"Could not generate the reconciliation report.");setData(null);}
    else setData(result as Reconciliation);
    setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);
  const t=data?.totals||{};
  return <main className="formPage">
    <Link href="/admin" className="back">← Admin</Link>
    <div className="formCard wide">
      <span className="eyebrow">ADMIN · FINANCIAL CONTROL</span>
      <h1>Financial <em>reconciliation.</em></h1>
      <p>Compare confirmed campaign funding against the financial ledger, refunds and committed creator payouts. Withdrawal requests are reported separately so they are not mistaken for campaign delivery costs.</p>
      <div className="choiceRow"><button className="primary" disabled={loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh reconciliation"}</button>{data?.generated_at&&<small>Generated {new Date(data.generated_at).toLocaleString()}</small>}</div>
      {error&&<div className="successBox" role="alert">{error}</div>}
      {loading&&!data&&<div className="successBox">Generating financial reconciliation…</div>}
      {data&&<>
        <div className="statsGrid">
          <div><b>CAMPAIGNS CHECKED</b><strong>{t.campaign_count||0}</strong></div>
          <div><b>FUNDING LEDGER</b><strong>{money(t.funding_ledger_total||0)}</strong></div>
          <div><b>REFUNDS RECORDED</b><strong>{money(t.refund_ledger_total||0)}</strong></div>
          <div><b>CREATOR PAYOUTS COMMITTED</b><strong>{money(t.creator_payouts_committed||0)}</strong></div>
          <div><b>CREATOR PAYOUTS RELEASED</b><strong>{money(t.creator_payouts_released||0)}</strong></div>
          <div><b>CREATOR PAYOUTS HELD</b><strong>{money(t.creator_payouts_held||0)}</strong></div>
          <div><b>PENDING FUNDING</b><strong>{money(t.pending_funding||0)}</strong></div>
          <div><b>WITHDRAWALS PENDING</b><strong>{money(t.withdrawals_pending||0)}</strong></div>
          <div><b>WITHDRAWALS APPROVED</b><strong>{money(t.withdrawals_approved||0)}</strong></div>
          <div><b>WITHDRAWALS PAID</b><strong>{money(t.withdrawals_paid||0)}</strong></div>
          <div><b>WITHDRAWALS REJECTED</b><strong>{money(t.withdrawals_rejected||0)}</strong></div>
          <div><b>WITHDRAWAL REQUESTS</b><strong>{t.withdrawal_count||0}</strong></div>
        </div>
        <div className="infoBox">
          <b>Reconciliation rules</b>
          <p>Confirmed funding ledger entries are compared with each campaign's funded amount. Creator payouts in pending, held or released states are checked against the campaign's net funded budget after recorded refunds. Withdrawals are shown separately because they represent transfers from creator balances, not a second campaign expense.</p>
        </div>
        <h2>Discrepancies requiring review · {data.issue_count}</h2>
        {data.issues.length?<div className="opps">{data.issues.map((issue,i)=><article key={issue.campaign_id+"-"+i}>
          <b>{label(issue.issue).toUpperCase()}</b>
          <h3>{issue.campaign_name}</h3>
          <p>Funding difference: {money(issue.funding_difference)} · Payout overrun: {money(issue.payout_overrun)}</p>
          <small>Campaign ID: {issue.campaign_id}</small>
          <div><Link href={"/admin/campaigns"}>Review campaigns →</Link></div>
        </article>)}</div>:<div className="successBox">No funding or payout-budget discrepancies were found in the current ledger snapshot.</div>}
        <h2>Campaign ledger detail</h2>
        {data.campaigns.length?<div className="opps">{data.campaigns.map(c=><article key={c.campaign_id}>
          <b>{c.campaign_status.toUpperCase()}</b>
          <h3>{c.campaign_name}</h3>
          <p>Funding ledger: {money(c.ledger_funding)} · Campaign funded amount: {money(c.campaign_funded_amount)}</p>
          <p>Refunds: {money(c.ledger_refunds)} · Committed payouts: {money(c.committed_creator_payouts)} · Released: {money(c.released_creator_payouts)}</p>
          <small>Budget {money(c.max_budget)} · {c.funding_records} funding records · {c.payout_records} payout records</small>
        </article>)}</div>:<div className="successBox">No campaigns have financial records yet.</div>}
      </>}
    </div>
  </main>;
}
