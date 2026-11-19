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
const statusLabel = (s: string) => s === "held" ? "Confirmed · campaign escrow" : s.replaceAll("_", " ");

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
      const { data, error: queryError } = await supabase
        .from("campaign_payments")
        .select("id,campaign_id,amount,type,status,provider,created_at,campaigns(name)")
        .in("type", ["funding", "refund"])
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
    pending: rows.filter(r => r.type === "funding" && r.status === "pending").reduce((n, r) => n + Number(r.amount || 0), 0)
  }), [rows]);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADVERTISER BILLING</span>
        <h1>Your campaign <em>payments.</em></h1>
        <p>View campaign funding and refund records. Confirmed campaign funds remain allocated to the campaign until valid delivery and payout rules are met.</p>
        <div className="statsGrid">
          <div><b>CONFIRMED FUNDING</b><strong>{loading ? "—" : naira(totals.confirmed)}</strong></div>
          <div><b>AWAITING CONFIRMATION</b><strong>{loading ? "—" : naira(totals.pending)}</strong></div>
          <div><b>REFUNDS RECORDED</b><strong>{loading ? "—" : naira(totals.refunded)}</strong></div>
        </div>
        {error && <div className="successBox" role="alert">{error}</div>}
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
                  <div className="choiceRow"><b>{row.type === "funding" ? "Campaign funding" : "Refund"}</b><strong>{naira(Number(row.amount || 0))}</strong></div>
                  <h3>{campaign?.name || "Campaign"}</h3>
                  <p>{statusLabel(row.status)} · {(row.provider || "Payment provider").toUpperCase()}</p>
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
