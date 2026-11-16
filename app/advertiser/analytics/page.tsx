"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadMyCampaignAnalytics, type CampaignAnalytics } from "@/lib/campaign-analytics";

export default function AdvertiserAnalytics() {
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase) {
        setMessage("AdBridge database connection is not configured.");
        setLoading(false);
        return;
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }

      const result = await loadMyCampaignAnalytics();
      if (!active) return;
      if (result.error || !result.data) {
        setMessage(result.error?.message || "Campaign analytics could not be loaded.");
      } else {
        setAnalytics(result.data);
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const value = (number: number | undefined) => loading ? "—" : (number ?? 0).toLocaleString();

  return (
    <main className="dashboard">
      <div className="topbar">
        <Link href="/advertiser">← Dashboard</Link>
        <span className="pill">Advertiser</span>
      </div>
      <section className="hero">
        <p className="eyebrow">PERFORMANCE</p>
        <h1>Campaign Analytics</h1>
        <p>Activity attributed to campaigns owned by your advertiser account.</p>
      </section>
      {message && <p className="fieldHint" role="alert">{message}</p>}
      <div className="grid">
        <div className="card">
          <strong>Campaigns</strong>
          <h2>{value(analytics?.campaignCount)}</h2>
          <p>Your campaigns in AdBridge.</p>
        </div>
        <div className="card">
          <strong>Platform-reported views</strong>
          <h2>{value(analytics?.platformReportedViews)}</h2>
          <p>Latest counts returned by supported social platform APIs; not independently audited.</p>
        </div>
        <div className="card">
          <strong>Tracked clicks</strong>
          <h2>{value(analytics?.trackedClicks)}</h2>
          <p>Clicks recorded through AdBridge tracking links.</p>
        </div>
        <div className="card">
          <strong>Approved conversions</strong>
          <h2>{value(analytics?.approvedConversions)}</h2>
          <p>CPA/CPI conversion events accepted by AdBridge.</p>
        </div>
      </div>
    </main>
  );
}
