"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string; status: string; max_budget: number | null; funded_amount: number | null; created_at: string };
type LedgerRow = { id: string; campaign_id: string; amount: number; type: string; status: string; created_at: string; campaigns: { name: string } | { name: string }[] | null };
type BudgetRow = { campaign: Campaign; confirmed: number; refunded: number; committed: number; remaining: number };

const money = (n: number) => "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const confirmedStatuses = ["held", "released"];
const committedStatuses = ["pending", "held", "released"];

export default function AdvertiserBudget() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) { setError("AdBridge database is not connected."); setLoading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data: campaigns, error: campaignError } = await supabase
        .from("campaigns")
        .select("id,name,status,max_budget,funded_amount,created_at")
        .eq("advertiser_id", user.id)
        .order("created_at", { ascending: false });
      if (campaignError) { if (live) { setError("Campaign budgets could not be loaded."); setLoading(false); } return; }
      const list = (campaigns || []) as Campaign[];
      if (!list.length) { if (live) { setRows([]); setLoading(false); } return; }
      const ids = list.map(c => c.id);
      const { data: payments, error: paymentError } = await supabase
        .from("campaign_payments")
        .select("id,campaign_id,amount,type,status,created_at,campaigns(name)")
        .in("campaign_id", ids)
        .in("type", ["funding", "refund", "creator_payment"]);
      if (!live) return;
      if (paymentError) { setError("The campaign payment ledger could not be loaded."); setLoading(false); return; }
      const ledger = (payments || []) as LedgerRow[];
      setRows(list.map(c => {
        const own = ledger.filter(p => p.campaign_id === c.id);
        const confirmed = own.filter(p => p.type === "funding" && confirmedStatuses.includes(p.status)).reduce((n,p) => n + Number(p.amount || 0), 0);
        const refunded = own.filter(p => p.type === "refund" && confirmedStatuses.includes(p.status)).reduce((n,p) => n + Number(p.amount || 0), 0);
        const committed = own.filter(p => p.type === "creator_payment" && committedStatuses.includes(p.status)).reduce((n,p) => n + Number(p.amount || 0), 0);
        return { campaign: c, confirmed, refunded, committed, remaining: Math.max(0, confirmed - refunded - committed) };
      }));
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    confirmed: a.confirmed + r.confirmed,
    committed: a.committed + r.committed,
    refunded: a.refunded + r.refunded,
    remaining: a.remaining + r.remaining,
    planned: a.planned + Number(r.campaign.max_budget || 0)
  }), { confirmed: 0, committed: 0, refunded: 0, remaining: 0, planned: 0 }), [rows]);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CAMPAIGN BUDGET CONTROL</span>
        <h1>Know where every <em>naira goes.</em></h1>
        <p>Only provider-confirmed campaign funding is treated as available money. Creator and publisher payments already committed to delivery are deducted from the remaining funded balance.</p>
        {error && <div className="successBox" role="alert">{error} <button type="button" className="secondary" onClick={() => window.location.reload()}>Retry budget</button></div>}
        {!error && <section className="statsGrid" aria-label="Budget totals">
          <div><b>CONFIRMED FUNDING</b><strong>{loading ? "—" : money(totals.confirmed)}</strong><small>Confirmed ledger entries only</small></div>
          <div><b>COMMITTED PAYOUTS</b><strong>{loading ? "—" : money(totals.committed)}</strong><small>Pending, held or released creator payments</small></div>
          <div><b>CONFIRMED REFUNDS</b><strong>{loading ? "—" : money(totals.refunded)}</strong><small>Refund ledger entries deducted</small></div>
          <div><b>REMAINING FUNDED BUDGET</b><strong>{loading ? "—" : money(totals.remaining)}</strong><small>Funding less refunds and committed payouts</small></div>
          <div><b>PLANNED CAMPAIGN BUDGET</b><strong>{loading ? "—" : money(totals.planned)}</strong><small>Campaign limits, not deposited funds</small></div>
        </section>}
        {loading && <div className="successBox">Reconciling campaign funding and committed delivery…</div>}
        {!loading && !error && rows.length === 0 && <div className="notificationEmpty"><h2>No campaign budgets yet</h2><p>Create a campaign to start a budget ledger. A planned budget is not treated as funded money.</p><Link href="/advertiser/new">Create a campaign →</Link></div>}
        {!loading && !error && rows.length > 0 && <div className="opps">
          {rows.map(({ campaign, confirmed, refunded, committed, remaining }) => (
            <article key={campaign.id}>
              <div className="choiceRow"><b>{campaign.name}</b><span>{campaign.status.replaceAll("_", " ")}</span></div>
              <div className="statsGrid">
                <div><b>CONFIRMED HELD FUNDING</b><strong>{money(confirmed)}</strong></div>
                <div><b>CONFIRMED REFUNDS</b><strong>{money(refunded)}</strong></div>
                <div><b>COMMITTED PAYOUTS</b><strong>{money(committed)}</strong></div>
                <div><b>REMAINING FUNDED</b><strong>{money(remaining)}</strong></div>
              </div>
              <small>Maximum budget: {money(Number(campaign.max_budget || 0))}</small>
              <div className="choiceRow">
                <Link href={"/advertiser/results?campaign=" + campaign.id}>Delivery results →</Link>
                <Link href={"/advertiser/billing"}>Payment history →</Link>
              </div>
            </article>
          ))}
        </div>}
        <div className="quick"><Link href="/advertiser/billing">Open full billing history →</Link></div>
      </div>
    </main>
  );
}
