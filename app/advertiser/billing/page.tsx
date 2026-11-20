"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type PaymentRow = {
  id: string;
  campaign_id: string;
  amount: number;
  type: string;
  status: string;
  provider: string | null;
  created_at: string;
  campaigns: { name: string } | { name: string }[] | null;
};

const naira = (n: number) => "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const statusLabel = (s: string, type: string) => s === "held" ? (type === "funding" ? "Confirmed · campaign escrow" : "Held · verification / fraud review") : s.replaceAll("_", " ");

export default function AdvertiserBilling() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) { setError("AdBridge database is not connected."); setLoading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data: ownedCampaigns, error: campaignError } = await supabase
        .from("campaigns")
        .select("id")
        .eq("advertiser_id", user.id);
      if (campaignError) {
        if (live) { setError("We couldn't load your billing history."); setLoading(false); }
        return;
      }
      const campaignIds = (ownedCampaigns || []).map(c => c.id);
      if (!campaignIds.length) {
        if (live) { setRows([]); setLoading(false); }
        return;
      }
      const { data, error: queryError } = await supabase
        .from("campaign_payments")
        .select("id,campaign_id,amount,type,status,provider,created_at,campaigns(name)")
        .in("campaign_id", campaignIds)
        .in("type", ["funding", "refund", "creator_payment"])
        .order("created_at", { ascending: false });
      if (!live) return;
      if (queryError) setError("We couldn't load your billing history.");
      else setRows((data || []) as PaymentRow[]);
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const totals = useMemo(() => ({
    confirmed: rows.filter(r => r.type === "funding" && ["held", "released"].includes(r.status)).reduce((n, r) => n + Number(r.amount || 0), 0),
    refunded: rows.filter(r => r.type === "refund" && ["held", "released"].includes(r.status)).reduce((n, r) => n + Number(r.amount || 0), 0),
    pending: rows.filter(r => r.type === "funding" && r.status === "pending").reduce((n, r) => n + Number(r.amount || 0), 0),
    paid: rows.filter(r => r.type === "creator_payment" && r.status === "released").reduce((n, r) => n + Number(r.amount || 0), 0),
    held: rows.filter(r => r.type === "creator_payment" && ["pending", "held"].includes(r.status)).reduce((n, r) => n + Number(r.amount || 0), 0)
  }), [rows]);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADVERTISER BILLING</span>
        <h1>Your campaign <em>payments.</em></h1>
        <p>View campaign funding and refund records. Confirmed campaign funds remain allocated to the campaign until valid delivery and payout rules are met.</p>
        {!error && <div className="statsGrid">
          <div><b>CONFIRMED FUNDING</b><strong>{loading ? "—" : naira(totals.confirmed)}</strong></div>
          <div><b>AWAITING CONFIRMATION</b><strong>{loading ? "—" : naira(totals.pending)}</strong></div>
          <div><b>CREATOR / PUBLISHER PAYOUTS</b><strong>{loading ? "—" : naira(totals.paid)}</strong></div>
          <div><b>PAYOUTS HELD FOR REVIEW</b><strong>{loading ? "—" : naira(totals.held)}</strong></div>
          <div><b>REFUNDS RECORDED</b><strong>{loading ? "—" : naira(totals.refunded)}</strong></div>
        </div>}
        {error && <div className="successBox" role="alert">{error} <button type="button" className="secondary" onClick={() => window.location.reload()}>Retry billing</button></div>}
        {loading && <div className="successBox">Loading billing history…</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="notificationEmpty"><h2>No billing records yet</h2><p>When you fund a campaign, the payment record will appear here.</p><Link href="/advertiser/new">Create a campaign →</Link></div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="opps">
            {rows.map(row => {
              const campaign = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
              return (
                <article key={row.id}>
                  <div className="choiceRow"><b>{row.type === "funding" ? "Campaign funding" : row.type === "refund" ? "Refund" : "Creator / publisher payout"}</b><strong>{naira(Number(row.amount || 0))}</strong></div>
                  <h3>{campaign?.name || "Campaign"}</h3>
                  <p>{statusLabel(row.status, row.type)} · {(row.provider || "AdBridge ledger").toUpperCase()}</p>
                  <small>{new Date(row.created_at).toLocaleString()}</small>
                  <div><Link href={"/advertiser/results?campaign=" + row.campaign_id}>Open campaign results →</Link></div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
