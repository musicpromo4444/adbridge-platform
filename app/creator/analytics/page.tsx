"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Metrics = {
  campaigns: number;
  verifiedViews: number;
  clicks: number;
  uniqueClicks: number;
  releasedEarnings: number;
};

export default function CreatorAnalytics() {
  const [stats, setStats] = useState<Metrics>({
    campaigns: 0, verifiedViews: 0, clicks: 0, uniqueClicks: 0, releasedEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) {
        setError("AdBridge database is not connected.");
        setLoading(false);
        return;
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }
      const [{ data: jobs, error: jobsError }, { data: submissions, error: submissionsError }, { data: links, error: linksError }, { data: payments, error: paymentsError }] = await Promise.all([
        supabase.from("creator_campaigns").select("campaign_id").eq("creator_id", user.id),
        supabase.from("submissions").select("current_metric,metric_status").eq("creator_id", user.id),
        supabase.from("tracking_links").select("click_count,unique_click_count").eq("creator_id", user.id),
        supabase.from("campaign_payments").select("amount").eq("creator_id", user.id).eq("type", "creator_payment").eq("status", "released"),
      ]);
      if (!live) return;
      if (jobsError || submissionsError || linksError || paymentsError) {
        setError("Some creator analytics could not be loaded. Please refresh.");
      }
      const uniqueCampaigns = new Set((jobs || []).map(job => job.campaign_id));
      setStats({
        campaigns: uniqueCampaigns.size,
        verifiedViews: (submissions || [])
          .filter(row => row.metric_status === "verified")
          .reduce((total, row) => total + Number(row.current_metric || 0), 0),
        clicks: (links || []).reduce((total, row) => total + Number(row.click_count || 0), 0),
        uniqueClicks: (links || []).reduce((total, row) => total + Number(row.unique_click_count || 0), 0),
        releasedEarnings: (payments || []).reduce((total, row) => total + Number(row.amount || 0), 0),
      });
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const number = (value: number) => value.toLocaleString("en-NG");
  const money = (value: number) => "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: 2 });

  return (
    <main className="dashboard">
      <div className="topbar"><Link href="/creator">← Creator Dashboard</Link><span className="pill">Creator</span></div>
      <section className="hero">
        <p className="eyebrow">PERFORMANCE</p>
        <h1>Creator Analytics</h1>
        <p>Only platform-verified view metrics are included in verified views. Tracking-link clicks and released earnings are shown separately.</p>
      </section>
      {error && <div className="successBox" role="alert">{error}</div>}
      <div className="grid">
        <div className="card"><strong>Campaigns joined</strong><h2>{loading ? "—" : number(stats.campaigns)}</h2><p>Your accepted campaign jobs.</p></div>
        <div className="card"><strong>Verified views</strong><h2>{loading ? "—" : number(stats.verifiedViews)}</h2><p>Unverified creator-entered figures are excluded.</p></div>
        <div className="card"><strong>Total clicks</strong><h2>{loading ? "—" : number(stats.clicks)}</h2><p>Clicks recorded against your campaign links.</p></div>
        <div className="card"><strong>Unique clicks</strong><h2>{loading ? "—" : number(stats.uniqueClicks)}</h2><p>Unique visitor counts recorded for your links.</p></div>
        <div className="card"><strong>Released earnings</strong><h2>{loading ? "—" : money(stats.releasedEarnings)}</h2><p>Payments marked released in the AdBridge ledger.</p></div>
      </div>
      <div className="quick">
        <Link href="/creator/work">Manage campaign work →</Link> · <Link href="/creator/earnings">View earnings and withdrawals →</Link> · <Link href="/creator/connections">Manage connected accounts →</Link>
      </div>
    </main>
  );
}
