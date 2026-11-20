"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  platform: string | null;
  status: string;
  payment_method: string | null;
  payment_rate: number | null;
  max_budget: number | null;
};
type SubmissionMetric = { campaign_id: string; current_metric: number | null; metric_status: string };
type LinkMetric = { campaign_id: string; click_count: number | null; unique_click_count: number | null };
type ConversionMetric = { campaign_id: string };
type FundingMetric = { campaign_id: string; amount: number; status: string };
type CampaignMetrics = {
  campaign: Campaign;
  verifiedViews: number;
  clicks: number;
  uniqueClicks: number;
  conversions: number;
  confirmedFunding: number;
};

const money = (n: number) => "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const number = (n: number) => n.toLocaleString("en-NG");
const readable = (value: string | null) => (value || "Not specified").replaceAll("_", " ");

export default function AdvertiserAnalytics() {
  const [rows, setRows] = useState<CampaignMetrics[]>([]);
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

      const { data: campaigns, error: campaignError } = await supabase
        .from("campaigns")
        .select("id,name,goal,platform,status,payment_method,payment_rate,max_budget")
        .eq("advertiser_id", user.id)
        .order("created_at", { ascending: false });

      if (campaignError) {
        if (live) {
          setError("Campaign analytics could not be loaded. Please refresh and try again.");
          setLoading(false);
        }
        return;
      }

      const owned = (campaigns || []) as Campaign[];
      if (!owned.length) {
        if (live) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const ids = owned.map(c => c.id);
      const [submissionResult, linkResult, conversionResult, fundingResult] = await Promise.all([
        supabase.from("submissions").select("campaign_id,current_metric,metric_status").in("campaign_id", ids),
        supabase.from("tracking_links").select("campaign_id,click_count,unique_click_count").in("campaign_id", ids),
        supabase.from("cpa_conversion_events").select("campaign_id").in("campaign_id", ids).eq("status", "approved"),
        supabase.from("campaign_payments").select("campaign_id,amount,status").in("campaign_id", ids).eq("type", "funding").in("status", ["held", "released"])
      ]);

      if (!live) return;
      const queryFailed = submissionResult.error || linkResult.error || conversionResult.error || fundingResult.error;
      if (queryFailed) {
        setError("Some analytics could not be loaded. The figures below may be incomplete; refresh to try again.");
      }

      const submissions = (submissionResult.data || []) as SubmissionMetric[];
      const links = (linkResult.data || []) as LinkMetric[];
      const conversions = (conversionResult.data || []) as ConversionMetric[];
      const funding = (fundingResult.data || []) as FundingMetric[];

      setRows(owned.map(campaign => {
        const ownSubmissions = submissions.filter(s => s.campaign_id === campaign.id);
        const ownLinks = links.filter(link => link.campaign_id === campaign.id);
        return {
          campaign,
          verifiedViews: ownSubmissions
            .filter(s => s.metric_status === "verified")
            .reduce((total, s) => total + Number(s.current_metric || 0), 0),
          clicks: ownLinks.reduce((total, link) => total + Number(link.click_count || 0), 0),
          uniqueClicks: ownLinks.reduce((total, link) => total + Number(link.unique_click_count || 0), 0),
          conversions: conversions.filter(event => event.campaign_id === campaign.id).length,
          confirmedFunding: funding
            .filter(payment => payment.campaign_id === campaign.id)
            .reduce((total, payment) => total + Number(payment.amount || 0), 0)
        };
      }));
      setLoading(false);
    }

    void load();
    return () => { live = false; };
  }, []);

  const totals = useMemo(() => rows.reduce((total, row) => ({
    campaigns: total.campaigns + 1,
    views: total.views + row.verifiedViews,
    clicks: total.clicks + row.clicks,
    uniqueClicks: total.uniqueClicks + row.uniqueClicks,
    conversions: total.conversions + row.conversions,
    funding: total.funding + row.confirmedFunding
  }), { campaigns: 0, views: 0, clicks: 0, uniqueClicks: 0, conversions: 0, funding: 0 }), [rows]);

  return (
    <main className="dashboard">
      <div className="topbar">
        <Link href="/advertiser">← Dashboard</Link>
        <span className="pill">Advertiser</span>
      </div>
      <section className="hero">
        <p className="eyebrow">PERFORMANCE</p>
        <h1>Campaign Analytics</h1>
        <p>See verified delivery, accepted tracking activity, approved conversions and confirmed campaign funding. A tracking-link click is never counted as a video view.</p>
      </section>

      {error && <div className="successBox" role="alert">{error}</div>}

      <div className="grid" aria-label="All campaign analytics">
        <div className="card"><strong>Campaigns</strong><h2>{loading ? "—" : number(totals.campaigns)}</h2><p>Your campaigns in AdBridge.</p></div>
        <div className="card"><strong>Verified views</strong><h2>{loading ? "—" : number(totals.views)}</h2><p>Only submitted metrics marked verified.</p></div>
        <div className="card"><strong>Tracking-link clicks</strong><h2>{loading ? "—" : number(totals.clicks)}</h2><p>Accepted clicks recorded by campaign links; not video views.</p></div>
        <div className="card"><strong>Unique clicks</strong><h2>{loading ? "—" : number(totals.uniqueClicks)}</h2><p>Unique visitor counts reported by tracking links.</p></div>
        <div className="card"><strong>Approved conversions</strong><h2>{loading ? "—" : number(totals.conversions)}</h2><p>Approved conversion events only.</p></div>
        <div className="card"><strong>Confirmed funding</strong><h2>{loading ? "—" : money(totals.funding)}</h2><p>Funding ledger entries in held or released status.</p></div>
      </div>

      <section className="quick">
        <h2>Performance by campaign</h2>
        <p>Metrics are kept separate so each billing model is measured against the correct delivery signal.</p>
        {loading && <div className="successBox">Loading campaign performance…</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="notificationEmpty">
            <h2>No campaign analytics yet</h2>
            <p>Create a campaign to start tracking verified delivery and performance.</p>
            <Link href="/advertiser/new">Create a campaign →</Link>
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="opps">
            {rows.map(row => (
              <article key={row.campaign.id}>
                <div className="choiceRow">
                  <b>{row.campaign.name}</b>
                  <span>{readable(row.campaign.status)}</span>
                </div>
                <p>{readable(row.campaign.goal)} · {row.campaign.platform || "Multiple platforms"}</p>
                <p>Billing model: <strong>{readable(row.campaign.payment_method)}</strong>{row.campaign.payment_rate != null ? " · " + money(Number(row.campaign.payment_rate)) + " per result" : ""}</p>
                <div className="statsGrid">
                  <div><b>VERIFIED VIEWS</b><strong>{number(row.verifiedViews)}</strong></div>
                  <div><b>TRACKING CLICKS</b><strong>{number(row.clicks)}</strong></div>
                  <div><b>UNIQUE CLICKS</b><strong>{number(row.uniqueClicks)}</strong></div>
                  <div><b>APPROVED CONVERSIONS</b><strong>{number(row.conversions)}</strong></div>
                  <div><b>CONFIRMED FUNDING</b><strong>{money(row.confirmedFunding)}</strong></div>
                </div>
                <div className="choiceRow">
                  <Link href={"/advertiser/results?campaign=" + row.campaign.id}>Open campaign results →</Link>
                  <Link href={"/advertiser/budget"}>Budget control →</Link>
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
