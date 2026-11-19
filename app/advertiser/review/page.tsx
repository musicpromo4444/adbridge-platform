"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string };
type ReviewRow = { campaign_id: string; status: string; campaigns: { name: string } | { name: string }[] | null };

export default function Review() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) { setError("AdBridge database is not connected."); setLoading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data: owned, error: campaignError } = await supabase.from("campaigns")
        .select("id,name").eq("advertiser_id", user.id).order("created_at", { ascending: false });
      if (campaignError) { setError("Campaign review summaries could not be loaded."); setLoading(false); return; }
      const list = (owned || []) as Campaign[];
      if (!live) return;
      setCampaigns(list);
      const requested = new URLSearchParams(window.location.search).get("campaign") || "";
      const selected = list.find(c => c.id === requested);
      setCampaignId(selected?.id || "");
      const ids = selected ? [selected.id] : list.map(c => c.id);
      if (!ids.length) { setRows([]); setLoading(false); return; }
      const { data, error: submissionError } = await supabase.from("submissions")
        .select("campaign_id,status,campaigns(name)").in("campaign_id", ids);
      if (!live) return;
      if (submissionError) setError("Submission review summaries could not be loaded.");
      else setRows((data || []) as ReviewRow[]);
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  async function selectCampaign(id: string) {
    if (!supabase) return;
    setCampaignId(id); setLoading(true); setError("");
    let query = supabase.from("submissions").select("campaign_id,status,campaigns(name)");
    if (id) query = query.eq("campaign_id", id);
    else {
      const ids = campaigns.map(c => c.id);
      if (!ids.length) { setRows([]); setLoading(false); return; }
      query = query.in("campaign_id", ids);
    }
    const { data, error: queryError } = await query;
    if (queryError) setError("Submission review summaries could not be loaded.");
    else setRows((data || []) as ReviewRow[]);
    setLoading(false);
  }

  const counts = useMemo(() => ({
    waiting: rows.filter(r => r.status === "waiting").length,
    approved: rows.filter(r => r.status === "approved").length,
    changes: rows.filter(r => r.status === "changes_requested").length,
    rejected: rows.filter(r => r.status === "rejected").length
  }), [rows]);

  const campaignSummaries = useMemo(() => {
    const ids = campaignId ? [campaignId] : campaigns.map(c => c.id);
    return ids.map(id => {
      const campaign = campaigns.find(c => c.id === id);
      const list = rows.filter(r => r.campaign_id === id);
      return { id, name: campaign?.name || "Campaign", total: list.length, waiting: list.filter(r => r.status === "waiting").length, approved: list.filter(r => r.status === "approved").length, changes: list.filter(r => r.status === "changes_requested").length };
    });
  }, [rows, campaigns, campaignId]);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADBRIDGE MANAGED REVIEW</span>
        <h1>Your ads. <em>Our review.</em></h1>
        <p>AdBridge manages creator verification, submitted proof and campaign quality checks. Advertisers receive campaign-level progress summaries, not creator identities, social handles, private contact details or individual post links.</p>
        <label htmlFor="review-campaign-select">Campaign</label>
        <select id="review-campaign-select" className="textInput" value={campaignId} onChange={e => void selectCampaign(e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="statsGrid">
          <div><b>SUBMISSIONS</b><strong>{loading ? "—" : rows.length}</strong></div>
          <div><b>WAITING</b><strong>{loading ? "—" : counts.waiting}</strong></div>
          <div><b>APPROVED</b><strong>{loading ? "—" : counts.approved}</strong></div>
          <div><b>CHANGES REQUESTED</b><strong>{loading ? "—" : counts.changes}</strong></div>
        </div>
        {error && <div className="successBox" role="alert">{error}</div>}
        {loading && <div className="successBox">Loading campaign review summaries…</div>}
        {!loading && campaignSummaries.length > 0 && (
          <>
            <h2>Campaign review status</h2>
            <div className="opps">
              {campaignSummaries.map(c => (
                <article className="reviewSummary" key={c.id}>
                  <b>{c.name}</b>
                  <p>{c.total} submissions · {c.waiting} awaiting review · {c.approved} approved · {c.changes} changes requested</p>
                  <Link href={"/advertiser/results?campaign=" + c.id}>View campaign results →</Link>
                </article>
              ))}
            </div>
          </>
        )}
        {!loading && campaignSummaries.length === 0 && (
          <div className="notificationEmpty"><h2>No submissions yet</h2><p>When campaign work is submitted, AdBridge will review it and update your campaign summaries.</p></div>
        )}
      </div>
    </main>
  );
}
