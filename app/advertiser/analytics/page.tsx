"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Metrics = { campaigns: number; views: number; clicks: number; uniqueClicks: number; conversions: number; funded: number };

export default function AdvertiserAnalytics() {
  const [stats, setStats] = useState<Metrics>({ campaigns: 0, views: 0, clicks: 0, uniqueClicks: 0, conversions: 0, funded: 0 });
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
        .select("id,funded_amount")
        .eq("advertiser_id", user.id);
      if (campaignError) { setError("Campaign analytics could not be loaded."); setLoading(false); return; }
      const ids = (campaigns || []).map(c => c.id);
      if (!ids.length) { setLoading(false); return; }
      const [{ data: submissions, error: submissionError }, { data: links, error: linkError }, { count, error: conversionError }] = await Promise.all([
        supabase.from("submissions").select("current_metric,metric_status").in("campaign_id", ids),
        supabase.from("tracking_links").select("click_count,unique_click_count").in("campaign_id", ids),
        supabase.from("cpa_conversion_events").select("id", { count: "exact", head: true }).in("campaign_id", ids).eq("status", "approved")
      ]);
      if (!live) return;
      if (submissionError || linkError || conversionError) setError("Some performance metrics could not be loaded.");
      setStats({
        campaigns: ids.length,
        views: (submissions || []).filter(s => s.metric_status === "verified").reduce((n, s) => n + Number(s.current_metric || 0), 0),
        clicks: (links || []).reduce((n, x) => n + Number(x.click_count || 0), 0),
        uniqueClicks: (links || []).reduce((n, x) => n + Number(x.unique_click_count || 0), 0),
        conversions: count || 0,
        funded: (campaigns || []).reduce((n, c) => n + Number(c.funded_amount || 0), 0)
      });
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const value = (n: number) => n.toLocaleString("en-NG");
  const money = (n: number) => "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

  return (
    <main className="dashboard">
      <div className="topbar"><Link href="/advertiser">← Dashboard</Link><span className="pill">Advertiser</span></div>
      <section className="hero"><p className="eyebrow">PERFORMANCE</p><h1>Campaign Analytics</h1><p>Aggregated, verified activity from your campaigns. Individual creator identities and post links remain private.</p></section>
      {error && <div className="successBox" role="alert">{error}</div>}
      <div className="grid">
        <div className="card"><strong>Campaigns</strong><h2>{loading ? "—" : value(stats.campaigns)}</h2><p>Your campaigns in AdBridge.</p></div>
        <div className="card"><strong>Verified views</strong><h2>{loading ? "—" : value(stats.views)}</h2><p>Only metrics marked verified are included.</p></div>
        <div className="card"><strong>Total clicks</strong><h2>{loading ? "—" : value(stats.clicks)}</h2><p>All accepted creator tracking-link clicks.</p></div>
        <div className="card"><strong>Unique clicks</strong><h2>{loading ? "—" : value(stats.uniqueClicks)}</h2><p>Unique visitor counts across campaign links.</p></div>
        <div className="card"><strong>Approved conversions</strong><h2>{loading ? "—" : value(stats.conversions)}</h2><p>Approved conversion events only.</p></div>
        <div className="card"><strong>Confirmed funding</strong><h2>{loading ? "—" : money(stats.funded)}</h2><p>Campaign funds confirmed by the payment provider.</p></div>
      </div>
      <div className="quick"><Link href="/advertiser/results">Open campaign results →</Link> · <Link href="/advertiser/billing">View billing history →</Link></div>
    </main>
  );
}
