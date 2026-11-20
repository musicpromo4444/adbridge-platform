"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string; goal: string; platform: string | null; max_budget: number | null; desired_results: number | null; payment_method: string | null; payment_rate: number | null; funded_amount: number | null };
type SubmissionMetric = { id: string; status: string; current_metric: number | null; target_metric: number | null; metric_status: string | null; last_metric_check_at: string | null; posted_url: string | null };

export default function Results() {
  const params = useSearchParams();
  const requestedId = params.get("campaign");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(requestedId || "");
  const [submissions, setSubmissions] = useState<SubmissionMetric[]>([]);
  const [clicks, setClicks] = useState({ total: 0, unique: 0 });
  const [conversions, setConversions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(preferredCampaignId = requestedId || campaignId) {
    if (!supabase) { setError("AdBridge database is not connected."); setLoading(false); return; }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { window.location.href = "/login"; return; }
    const { data: owned, error: campaignError } = await supabase
      .from("campaigns")
      .select("id,name,goal,platform,max_budget,desired_results,payment_method,payment_rate,funded_amount")
      .eq("advertiser_id", user.id)
      .order("created_at", { ascending: false });
    if (campaignError) { setError("We couldn't load your campaign results."); setLoading(false); return; }
    const list = (owned || []) as Campaign[];
    setCampaigns(list);
    const selected = list.find(c => c.id === preferredCampaignId) || list[0];
    if (!selected) { setCampaignId(""); setSubmissions([]); setClicks({ total: 0, unique: 0 }); setConversions(0); setLoading(false); return; }
    setCampaignId(selected.id);

    const [{ data: metrics, error: metricsError }, { data: links, error: linksError }, { count, error: conversionError }] = await Promise.all([
      supabase.from("submissions").select("id,status,current_metric,target_metric,metric_status,last_metric_check_at,posted_url").eq("campaign_id", selected.id),
      supabase.from("tracking_links").select("click_count,unique_click_count").eq("campaign_id", selected.id),
      supabase.from("cpa_conversion_events").select("id", { count: "exact", head: true }).eq("campaign_id", selected.id).eq("status", "approved")
    ]);
    if (metricsError || linksError || conversionError) setError("Some campaign metrics could not be loaded. Please refresh.");
    setSubmissions((metrics || []) as SubmissionMetric[]);
    setClicks({
      total: (links || []).reduce((n, row) => n + Number(row.click_count || 0), 0),
      unique: (links || []).reduce((n, row) => n + Number(row.unique_click_count || 0), 0)
    });
    setConversions(count || 0);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [requestedId]);

  const selected = campaigns.find(c => c.id === campaignId) || null;
  const totals = useMemo(() => ({
    views: submissions.reduce((n, s) => n + (s.last_metric_check_at ? Number(s.current_metric || 0) : 0), 0),
    approved: submissions.filter(s => s.status === "approved").length,
    waiting: submissions.filter(s => s.status === "waiting").length,
    changes: submissions.filter(s => s.status === "changes_requested").length,
    checked: submissions.filter(s => !!s.last_metric_check_at).length
  }), [submissions]);

  async function refresh() {
    if (!supabase || !submissions.length) return;
    setBusy(true); setMessage(""); setError("");
    let checked = 0;
    for (const submission of submissions) {
      if (!submission.posted_url) continue;
      const { error: invokeError } = await supabase.functions.invoke("track-video-metrics", { body: { submission_id: submission.id } });
      if (!invokeError) checked++;
    }
    await load();
    setBusy(false);
    setMessage(checked ? "Requested fresh checks for " + checked + " published submission(s)." : "No published submissions were ready for a metrics check.");
  }

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CAMPAIGN RESULTS</span>
        <h1>Measure your <em>campaign impact.</em></h1>
        <p>AdBridge provides campaign-level performance summaries. Creator identities, personal handles and individual post links are kept private.</p>
        {campaigns.length > 0 && (
          <div className="formGrid">
            <div>
              <label htmlFor="campaign-results-select">Choose campaign</label>
              <select id="campaign-results-select" className="textInput" value={campaignId} onChange={e => { setCampaignId(e.target.value); setLoading(true); setMessage(""); setError(""); void loadFor(e.target.value); }}>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {loading && <div className="successBox">Loading verified campaign results…</div>}
        {error && <div className="successBox" role="alert">{error}</div>}
        {!loading && selected && (
          <>
            <p><b>{selected.name}</b> · {selected.platform || "Multiple platforms"} · {selected.payment_method || "Payment model not set"}</p>
            <div className="statsGrid">
              <div><b>PLATFORM-VERIFIED VIEWS</b><strong>{totals.views.toLocaleString()}</strong></div>
              <div><b>TOTAL CLICKS</b><strong>{clicks.total.toLocaleString()}</strong></div>
              <div><b>UNIQUE CLICKS</b><strong>{clicks.unique.toLocaleString()}</strong></div>
              <div><b>APPROVED CONVERSIONS</b><strong>{conversions.toLocaleString()}</strong></div>
            </div>
            <div className="quick">
              <h2>Delivery progress</h2>
              <div className="statsGrid">
                <div><b>SUBMISSIONS</b><strong>{submissions.length}</strong></div>
                <div><b>APPROVED</b><strong>{totals.approved}</strong></div>
                <div><b>AWAITING REVIEW</b><strong>{totals.waiting}</strong></div>
                <div><b>CHANGES REQUESTED</b><strong>{totals.changes}</strong></div>
              </div>
              <p>{totals.checked} submission(s) have received a successful platform API metric check. Their returned view counts are included; unverified or unchecked figures are excluded. {submissions.filter(s => s.metric_status === "verified").length} submission(s) have also reached their target metric.</p>
              <button className="primary" disabled={busy || !submissions.some(s => !!s.posted_url)} onClick={refresh}>
                {busy ? "Checking published metrics…" : "Check latest verified views"}
              </button>
              {message && <div className="successBox">{message}</div>}
            </div>
            <div className="quick">
              <h2>Campaign budget</h2>
              <p>{ "₦" + Number(selected.funded_amount || 0).toLocaleString("en-NG") } confirmed funding · { "₦" + Number(selected.max_budget || 0).toLocaleString("en-NG") } maximum budget</p>
              <p>{Number(selected.payment_rate || 0).toLocaleString("en-NG")} per {selected.payment_method === "cpm" ? "1,000 views" : selected.payment_method === "cpc" || selected.payment_method === "link_traffic" ? "click" : selected.payment_method === "cpi" ? "install" : selected.payment_method === "cpa" ? "approved action" : "approved creator delivery"}</p>
              <Link href={"/advertiser/review?campaign=" + selected.id}>View campaign review summary →</Link>
            </div>
          </>
        )}
        {!loading && !selected && <div className="notificationEmpty"><h2>No campaign results yet</h2><p>Create a campaign and fund it to start measuring delivery.</p><Link href="/advertiser/new">Create a campaign →</Link></div>}
      </div>
    </main>
  );

  async function loadFor(id: string) {
    if (!supabase || !id) return;
    const [{ data: metrics, error: metricsError }, { data: links, error: linksError }, { count, error: conversionError }] = await Promise.all([
      supabase.from("submissions").select("id,status,current_metric,target_metric,metric_status,last_metric_check_at,posted_url").eq("campaign_id", id),
      supabase.from("tracking_links").select("click_count,unique_click_count").eq("campaign_id", id),
      supabase.from("cpa_conversion_events").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "approved")
    ]);
    if (metricsError || linksError || conversionError) setError("Some campaign metrics could not be loaded. Please refresh.");
    setSubmissions((metrics || []) as SubmissionMetric[]);
    setClicks({ total: (links || []).reduce((n, row) => n + Number(row.click_count || 0), 0), unique: (links || []).reduce((n, row) => n + Number(row.unique_click_count || 0), 0) });
    setConversions(count || 0);
    setLoading(false);
  }
}
