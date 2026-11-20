"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string };
type ReviewRow = { campaign_id: string; status: string };

const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());

export default function Review() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (selectedId?: string, initial = false) => {
    if (!supabase) {
      setError("AdBridge database is not connected.");
      setLoading(false);
      return;
    }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    setRows([]);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data: owned, error: campaignError } = await supabase
      .from("campaigns")
      .select("id,name")
      .eq("advertiser_id", user.id)
      .order("created_at", { ascending: false });

    if (campaignError) {
      setError("Campaign review summaries could not be loaded. Please try again.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const list = (owned || []) as Campaign[];
    setCampaigns(list);
    const requested = selectedId ?? (new URLSearchParams(window.location.search).get("campaign") || campaignId);
    const selected = list.find(c => c.id === requested);
    const nextId = selected?.id || "";
    setCampaignId(nextId);

    const ids = nextId ? [nextId] : list.map(c => c.id);
    if (!ids.length) {
      setRows([]);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error: submissionError } = await supabase
      .from("submissions")
      .select("campaign_id,status")
      .in("campaign_id", ids);

    if (submissionError) {
      setError("Submission review summaries could not be loaded. Please try again.");
    } else {
      setRows((data || []) as ReviewRow[]);
      setLastUpdated(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, [campaignId]);

  useEffect(() => {
    void load(undefined, true);
  }, [load]);

  const counts = useMemo(() => ({
    total: rows.length,
    waiting: rows.filter(r => r.status === "waiting").length,
    approved: rows.filter(r => r.status === "approved").length,
    changes: rows.filter(r => r.status === "changes_requested").length,
    rejected: rows.filter(r => r.status === "rejected").length,
    other: rows.filter(r => !["waiting", "approved", "changes_requested", "rejected"].includes(r.status)).length
  }), [rows]);

  const summaries = useMemo(() => {
    const scope = campaignId ? campaigns.filter(c => c.id === campaignId) : campaigns;
    return scope.map(campaign => {
      const own = rows.filter(row => row.campaign_id === campaign.id);
      return {
        ...campaign,
        total: own.length,
        waiting: own.filter(row => row.status === "waiting").length,
        approved: own.filter(row => row.status === "approved").length,
        changes: own.filter(row => row.status === "changes_requested").length,
        rejected: own.filter(row => row.status === "rejected").length,
        other: own.filter(row => !["waiting", "approved", "changes_requested", "rejected"].includes(row.status)).length
      };
    });
  }, [rows, campaigns, campaignId]);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADBRIDGE MANAGED REVIEW</span>
        <h1>Your ads. <em>Our review.</em></h1>
        <p>AdBridge manages creator verification, submitted proof and campaign quality checks. Advertisers receive campaign-level progress summaries, not creator identities, social handles, private contact details or individual post links.</p>

        <div className="choiceRow">
          <div>
            <label htmlFor="review-campaign-select">Campaign filter</label>
            <select id="review-campaign-select" className="textInput" value={campaignId} onChange={e => void load(e.target.value)}>
              <option value="">All campaigns</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="secondary" type="button" onClick={() => void load(campaignId)} disabled={loading || refreshing}>
            {refreshing ? "Refreshing…" : "Refresh review"}
          </button>
        </div>

        {!error && <div className="statsGrid" aria-label="Submission review totals">
          <div><b>TOTAL SUBMISSIONS</b><strong>{loading ? "—" : counts.total}</strong><small>Across selected campaigns</small></div>
          <div><b>WAITING</b><strong>{loading ? "—" : counts.waiting}</strong><small>Awaiting AdBridge review</small></div>
          <div><b>APPROVED</b><strong>{loading ? "—" : counts.approved}</strong><small>Passed review</small></div>
          <div><b>CHANGES REQUESTED</b><strong>{loading ? "—" : counts.changes}</strong><small>Needs creator correction</small></div>
          <div><b>REJECTED</b><strong>{loading ? "—" : counts.rejected}</strong><small>Not approved</small></div>
          {counts.other > 0 && <div><b>OTHER STATUSES</b><strong>{loading ? "—" : counts.other}</strong><small>Additional workflow states</small></div>}
        </div>}

        {error && <div className="successBox" role="alert">{error} <button type="button" className="secondary" onClick={() => void load(campaignId)}>Retry review</button></div>}
        {loading && <div className="successBox">Loading campaign review summaries…</div>}
        {!loading && !error && summaries.length > 0 && (
          <>
            <div className="sectionHead">
              <h2>Campaign review status</h2>
              {lastUpdated && <small>Updated {lastUpdated.toLocaleTimeString()}</small>}
            </div>
            <div className="opps">
              {summaries.map(c => (
                <article className="reviewSummary" key={c.id}>
                  <div className="choiceRow"><b>{c.name}</b><span>{c.total} submissions</span></div>
                  <p>{c.waiting} awaiting review · {c.approved} approved · {c.changes} changes requested · {c.rejected} rejected{c.other ? " · " + c.other + " other" : ""}</p>
                  <div className="choiceRow">
                    <Link href={"/advertiser/results?campaign=" + c.id}>View campaign results →</Link>
                    <Link href={"/advertiser/campaigns"}>Manage campaign →</Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && !error && summaries.length === 0 && (
          <div className="notificationEmpty">
            <h2>No campaigns to review yet</h2>
            <p>Create a campaign first. Once creators or publishers submit delivery proof, AdBridge will review it and show progress here.</p>
            <Link href="/advertiser/new">Create a campaign →</Link>
          </div>
        )}
        <div className="quick">
          <h2>How review works</h2>
          <p><b>1. Submission received:</b> A creator or publisher submits campaign proof through AdBridge.</p>
          <p><b>2. AdBridge checks it:</b> Our review process checks the submission and supporting delivery evidence.</p>
          <p><b>3. Campaign summary updates:</b> Approved, waiting, changes-requested and rejected totals update here. Personal creator details remain private.</p>
        </div>
      </div>
    </main>
  );
}
