"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdPlacement from "@/components/AdPlacement";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  platform: string | null;
  status: string;
  max_budget: number | null;
  funded_amount: number | null;
  desired_results: number | null;
  payment_method: string | null;
  created_at: string;
};
type Submission = { campaign_id: string; status: string };

const money = (value: number) =>
  "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const readable = (value: string) => value.replaceAll("_", " ");

export default function Advertiser() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Advertiser");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (initial = false) => {
    if (!supabase) {
      setError("AdBridge database is not connected.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const [campaignResult, profileResult] = await Promise.all([
      supabase.from("campaigns")
        .select("id,name,goal,platform,status,max_budget,funded_amount,desired_results,payment_method,created_at")
        .eq("advertiser_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
    ]);

    if (campaignResult.error) {
      setError("We couldn't load your campaigns. Please refresh and try again.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const owned = (campaignResult.data || []) as Campaign[];
    let submissionRows: Submission[] = [];
    if (owned.length) {
      const result = await supabase.from("submissions")
        .select("campaign_id,status")
        .in("campaign_id", owned.map(c => c.id));
      if (result.error) {
        setError("Campaigns loaded, but submission summaries could not be loaded.");
      } else {
        submissionRows = (result.data || []) as Submission[];
      }
    }

    setCampaigns(owned);
    setSubmissions(submissionRows);
    setName(profileResult.data?.display_name || user.email?.split("@")[0] || "Advertiser");
    setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const stats = useMemo(() => ({
    total: campaigns.length,
    active: campaigns.filter(c => c.status === "active").length,
    funded: campaigns.reduce((n, c) => n + Number(c.funded_amount || 0), 0),
    planned: campaigns.reduce((n, c) => n + Number(c.max_budget || 0), 0),
    awaitingReview: submissions.filter(s => s.status === "waiting").length,
    approved: submissions.filter(s => s.status === "approved").length
  }), [campaigns, submissions]);

  return (
    <main className="dashboard">
      <div className="dashTop">
        <Link href="/" className="back">← AdBridge</Link>
        <span className="testBadge">ADVERTISER WORKSPACE</span>
        <Link href="/creator" className="switch">Creator side →</Link>
      </div>

      <section className="dashHero">
        <div>
          <span className="eyebrow">ADVERTISER DASHBOARD</span>
          <h1>Welcome back,<br /><em>{name}.</em></h1>
          <p>Launch campaigns, manage budgets and follow verified advertising performance from one place.</p>
          {updatedAt && <small>Last updated {updatedAt.toLocaleTimeString()}</small>}
        </div>
        <div className="choiceRow">
          <button className="secondary" type="button" onClick={() => void load()} disabled={loading || refreshing}>
            {refreshing ? "Refreshing…" : "Refresh dashboard"}
          </button>
          <Link className="primary" href="/advertiser/new">＋ Create a campaign</Link>
        </div>
      </section>

      <AdPlacement placementKey="main_feed" />

      {error && <div className="successBox" role="alert">{error}</div>}

      <section className="statsGrid" aria-label="Campaign overview">
        <div><b>CAMPAIGNS</b><strong>{loading ? "—" : stats.total}</strong><small>All your campaigns</small></div>
        <div><b>ACTIVE</b><strong>{loading ? "—" : stats.active}</strong><small>Currently running</small></div>
        <div><b>FUNDS CONFIRMED</b><strong>{loading ? "—" : money(stats.funded)}</strong><small>Recorded campaign funding</small></div>
        <div><b>PLANNED BUDGET</b><strong>{loading ? "—" : money(stats.planned)}</strong><small>Maximum budgets set</small></div>
        <div><b>AWAITING REVIEW</b><strong>{loading ? "—" : stats.awaitingReview}</strong><small>Submissions awaiting AdBridge</small></div>
        <div><b>APPROVED WORK</b><strong>{loading ? "—" : stats.approved}</strong><small>Submissions approved by review</small></div>
      </section>

      <div className="dashGrid">
        <section>
          <div className="sectionHead">
            <h2>Your campaigns</h2>
            <Link href="/advertiser/campaigns">View all campaigns →</Link>
          </div>
          {loading && <div className="successBox">Loading your campaigns…</div>}
          {!loading && campaigns.slice(0, 5).map(c => (
            <article className="campaign" key={c.id}>
              <div className="campaignIcon">✦</div>
              <div className="campaignInfo">
                <b>{c.name}</b>
                <small>{readable(c.goal)} · {c.platform || "Multiple platforms"}</small>
                <small>Funded {money(Number(c.funded_amount || 0))} of {money(Number(c.max_budget || 0))}</small>
              </div>
              <strong>{Number(c.desired_results || 0).toLocaleString()} target</strong>
              <span className={c.status === "active" ? "live" : "review"}>{readable(c.status)}</span>
              <Link href={"/advertiser/results?campaign=" + c.id}>Results →</Link>
            </article>
          ))}
          {!loading && !error && campaigns.length === 0 && (
            <div className="successBox">You haven't created a campaign yet. Create your first campaign to get started.</div>
          )}
        </section>
        <aside>
          <span className="eyebrow">CAMPAIGN CONTROL</span>
          <h3>{stats.awaitingReview} submissions awaiting review</h3>
          <p>Follow AdBridge review progress, inspect verified results and manage campaign status.</p>
          <Link href="/advertiser/review">Review campaign activity →</Link>\n          <div className="asideDivider" />\n          <Link href="/advertiser/delivery">Delivery control centre →</Link>
          <div className="asideDivider" />
          <Link href="/advertiser/campaigns">Manage campaigns →</Link>
          <div className="asideDivider" />
          <Link href="/advertiser/budget">Campaign budget control →</Link>
        </aside>
      </div>

      <section className="quick">
        <h2>Manage your advertising</h2>
        <div className="quickGrid">
          <Link href="/rankings"><b>№</b><span>Global Rankings</span><small>See top advertisers and publishers</small></Link>
          <Link href="/advertiser/new"><b>＋</b><span>Create campaign</span><small>Set your brief, audience and budget</small></Link>
          <Link href="/advertiser/campaigns"><b>▤</b><span>All campaigns</span><small>Edit drafts, pause or close campaigns</small></Link>\n          <Link href="/advertiser/delivery"><b>▶</b><span>Delivery control centre</span><small>Publisher placements, campaign delivery setup and readiness</small></Link>
          <Link href="/advertiser/review"><b>✓</b><span>Campaign review</span><small>See AdBridge's review progress</small></Link>
          <Link href="/advertiser/results"><b>↗</b><span>Campaign results</span><small>Track verified views, clicks and conversions</small></Link>
          <Link href="/advertiser/analytics"><b>▥</b><span>Analytics</span><small>Performance across your campaigns</small></Link>
          <Link href="/advertiser/billing"><b>₦</b><span>Billing & payments</span><small>Confirmed funding and refunds</small></Link>
          <Link href="/advertiser/budget"><b>↗</b><span>Budget control</span><small>Confirmed funds, committed payouts and remaining balance</small></Link>
        </div>
      </section>
    </main>
  );
}
