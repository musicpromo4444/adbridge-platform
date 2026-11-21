"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadAdvertiserCampaignAnalytics,
  type AdvertiserCampaignAnalyticsRow,
} from "@/lib/advertiser-analytics";

const money = (value: number | null) => value === null
  ? "—"
  : "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const number = (value: number | null) => value === null
  ? "—"
  : value.toLocaleString("en-NG");
const readable = (value: string | null) => (value || "Not specified").replaceAll("_", " ");
const isCpm = (method: string | null) => ["cpm", "views"].includes((method || "").toLowerCase());

function safeCountTotal(rows: AdvertiserCampaignAnalyticsRow[], field: keyof AdvertiserCampaignAnalyticsRow) {
  const total = rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  return Number.isSafeInteger(total) ? total : null;
}

function safeMoneyTotal(rows: AdvertiserCampaignAnalyticsRow[]) {
  const total = rows.reduce((sum, row) => sum + row.confirmed_funding, 0);
  return Number.isFinite(total) ? total : null;
}

export default function AdvertiserAnalytics() {
  const [rows, setRows] = useState<AdvertiserCampaignAnalyticsRow[]>([]);
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

      try {
        const analytics = await loadAdvertiserCampaignAnalytics(supabase);
        if (live) {
          setRows(analytics);
          setError("");
        }
      } catch {
        if (live) {
          setRows([]);
          setError("Campaign analytics could not be fully loaded. No partial totals are being presented as complete. Please retry.");
        }
      } finally {
        if (live) setLoading(false);
      }
    }

    void load();
    return () => { live = false; };
  }, []);

  const totals = useMemo(() => ({
    campaigns: rows.length,
    views: safeCountTotal(rows, "verified_views"),
    clicks: safeCountTotal(rows, "tracking_clicks"),
    uniqueClicks: safeCountTotal(rows, "unique_tracking_clicks"),
    conversions: safeCountTotal(rows, "approved_conversions"),
    staleChecks: safeCountTotal(rows, "stale_metric_submissions"),
    funding: safeMoneyTotal(rows),
  }), [rows]);

  return (
    <main className="dashboard">
      <div className="topbar">
        <Link href="/advertiser">← Dashboard</Link>
        <span className="pill">Advertiser</span>
      </div>
      <section className="hero">
        <p className="eyebrow">PERFORMANCE</p>
        <h1>Campaign Analytics</h1>
        <p>See platform-verified delivery, accepted tracking activity, approved conversions and confirmed campaign funding. A tracking-link click is never counted as a video view.</p>
      </section>

      {error && (
        <div className="successBox" role="alert">
          {error} <button type="button" className="secondary" onClick={() => window.location.reload()}>Retry analytics</button>
        </div>
      )}

      <div className="grid" aria-label="All campaign analytics">
        <div className="card"><strong>Campaigns</strong><h2>{loading ? "—" : number(totals.campaigns)}</h2><p>Your campaigns in AdBridge.</p></div>
        <div className="card"><strong>Verified views</strong><h2>{loading ? "—" : number(totals.views)}</h2><p>Platform-reported CPM views only.</p></div>
        <div className="card"><strong>Tracking-link clicks</strong><h2>{loading ? "—" : number(totals.clicks)}</h2><p>Accepted clicks recorded by campaign links; not video views.</p></div>
        <div className="card"><strong>Unique clicks</strong><h2>{loading ? "—" : number(totals.uniqueClicks)}</h2><p>Unique visitor counts reported by tracking links.</p></div>
        <div className="card"><strong>Approved conversions</strong><h2>{loading ? "—" : number(totals.conversions)}</h2><p>Approved conversion events only.</p></div>
        <div className="card"><strong>Confirmed funding</strong><h2>{loading ? "—" : money(totals.funding)}</h2><p>Funding ledger entries in held or released status.</p></div>
        <div className="card"><strong>CPM checks needing refresh</strong><h2>{loading ? "—" : number(totals.staleChecks)}</h2><p>Tracked submissions with no successful check in the last 24 hours.</p></div>
      </div>

      <section className="quick">
        <h2>Performance by campaign</h2>
        <p>Metrics are kept separate so each billing model is measured against the correct delivery signal. Freshness is based on the last successful platform API check, not a browser event.</p>
        {loading && <div className="successBox">Loading campaign performance…</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="notificationEmpty">
            <h2>No campaign analytics yet</h2>
            <p>Create a campaign to start tracking verified delivery and performance.</p>
            <Link href="/advertiser/new">Create a campaign →</Link>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="opps">
            {rows.map(row => (
              <article key={row.campaign_id}>
                <div className="choiceRow">
                  <b>{row.campaign_name}</b>
                  <span>{readable(row.campaign_status)}</span>
                </div>
                <p>{readable(row.goal)} · {row.platform || "Multiple platforms"}</p>
                <p>Billing model: <strong>{readable(row.payment_method)}</strong>{row.payment_rate !== null ? " · " + money(row.payment_rate) + " per result" : ""}</p>
                <div className="statsGrid">
                  <div><b>VERIFIED VIEWS</b><strong>{number(row.verified_views)}</strong><small>{number(row.verified_submissions)} submissions reached their configured view target.</small></div>
                  <div><b>TRACKING CLICKS</b><strong>{number(row.tracking_clicks)}</strong></div>
                  <div><b>UNIQUE CLICKS</b><strong>{number(row.unique_tracking_clicks)}</strong></div>
                  <div><b>APPROVED CONVERSIONS</b><strong>{number(row.approved_conversions)}</strong></div>
                  <div><b>CONFIRMED FUNDING</b><strong>{money(row.confirmed_funding)}</strong></div>
                </div>

                {isCpm(row.payment_method) && (
                  <div className="successBox" role="status">
                    <strong>Platform metric freshness</strong>
                    <p>
                      {row.stale_metric_submissions > 0
                        ? number(row.stale_metric_submissions) + " CPM submission(s) have no successful platform check in the last 24 hours."
                        : row.tracked_submissions > 0
                          ? "All tracked CPM submissions have a successful platform check within the last 24 hours."
                          : "No successful platform metric check has been recorded yet."}
                    </p>
                    {row.latest_metric_check_at && (
                      <small>Latest successful platform check: {new Date(row.latest_metric_check_at).toLocaleString("en-NG")}.</small>
                    )}
                  </div>
                )}

                <div className="choiceRow">
                  <Link href={"/advertiser/results?campaign=" + row.campaign_id}>Open campaign results →</Link>
                  <Link href="/advertiser/budget">Budget control →</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="quick">
        <Link href="/advertiser/results">Open campaign results →</Link> · <Link href="/advertiser/billing">View billing history →</Link>
      </div>
    </main>
  );
}
