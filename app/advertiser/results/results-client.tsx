"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Results() {
  const params = useSearchParams();
  const campaignId = params.get("campaign");
  const [campaign, setCampaign] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [conversions, setConversions] = useState(0);
  const [conversionEvents, setConversionEvents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    let query = supabase
      .from("campaigns")
      .select("id,name,goal,platform,max_budget,desired_results,payment_method,payment_rate")
      .eq("advertiser_id", user.id)
      .limit(1);
    if (campaignId) query = query.eq("id", campaignId);

    const { data } = await query.single();
    if (!data) return;
    setCampaign(data);

    const [{ data: submissionRows }, { data: trackingLinks }, { count }, { data: events }] = await Promise.all([
      supabase.from("submissions")
        .select("id,status,creator_id,posted_url,tracking_platform,current_metric,target_metric,metric_status,last_metric_check_at")
        .eq("campaign_id", data.id)
        .order("submitted_at", { ascending: false }),
      supabase.from("tracking_links")
        .select("id,creator_id,submission_id,slug,click_count,unique_click_count,target_url")
        .eq("campaign_id", data.id),
      supabase.from("cpa_conversion_events")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.id)
        .eq("status", "approved"),
      supabase.from("cpa_conversion_events")
        .select("id,external_conversion_id,action_type,value,status,created_at")
        .eq("campaign_id", data.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    setSubmissions(submissionRows || []);
    setClicks(trackingLinks || []);
    setConversions(count || 0);
    setConversionEvents(events || []);
  }

  useEffect(() => {
    void load();
  }, [campaignId]);

  async function refresh() {
    if (!supabase || !submissions.length) return;
    setBusy(true);
    setMessage("");
    let checked = 0;
    for (const submission of submissions) {
      if (!submission.posted_url) continue;
      const { error } = await supabase.functions.invoke("track-video-metrics", {
        body: { submission_id: submission.id },
      });
      if (!error) checked += 1;
    }
    await load();
    setBusy(false);
    setMessage(checked
      ? "Checked " + checked + " published video" + (checked === 1 ? "." : "s.")
      : "No video could be checked yet.");
  }

  const paymentMethod = String(campaign?.payment_method || "").toLowerCase();
  const clickBased = ["clicks", "cpc", "link_traffic", "cpi", "cpa", "actions"].includes(paymentMethod);
  const actionBased = ["actions", "cpa", "cpi"].includes(paymentMethod);
  const viewBased = ["views", "cpm"].includes(paymentMethod);
  const totalViews = submissions.reduce((sum, row) => sum + Number(row.current_metric || 0), 0);
  const totalClicks = clicks.reduce((sum, row) => sum + Number(row.click_count || 0), 0);
  const uniqueClicks = clicks.reduce((sum, row) => sum + Number(row.unique_click_count || 0), 0);

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CAMPAIGN RESULTS</span>
        <h1>See what your <em>campaign achieved.</em></h1>
        {campaign ? (
          <>
            <p>{campaign.name} · {campaign.platform || "Any platform"}</p>
            <div className="statsGrid">
              <div><b>Verified views</b><strong>{totalViews.toLocaleString()}</strong></div>
              <div><b>Clicks</b><strong>{totalClicks.toLocaleString()}</strong></div>
              <div><b>Conversions</b><strong>{conversions.toLocaleString()}</strong></div>
              <div><b>Submissions</b><strong>{submissions.length}</strong></div>
            </div>

            <div className="quick">
              <h2>Result tracking</h2>
              {clickBased && <p>Creator links use AdBridge's server-side redirect. Click totals are recorded by the tracking service.</p>}
              {actionBased && <p>CPA/CPI postbacks are accepted only when they include a valid AdBridge click ID. AdBridge resolves the creator from the saved link.</p>}
              {viewBased && <p>AdBridge retrieves published view metrics from connected platform APIs.</p>}
              {!clickBased && !actionBased && !viewBased && <p>AdBridge checks published work and available verified metrics.</p>}
              {clickBased && <p><b>Tracked clicks:</b> {totalClicks.toLocaleString()} · <b>Unique visitors:</b> {uniqueClicks.toLocaleString()}</p>}
              {actionBased && <p><b>Verified actions:</b> {conversions.toLocaleString()} / {Number(campaign.desired_results || 0).toLocaleString()}</p>}
              {viewBased && (
                <>
                  <button className="primary" disabled={busy || !submissions.length} onClick={refresh}>
                    {busy ? "Checking videos…" : "Check latest views"}
                  </button>
                  {message && <div className="successBox">{message}</div>}
                </>
              )}
            </div>

            {clicks.length > 0 && (
              <div className="quick">
                <h2>Creator tracking links</h2>
                <p>Repeat visits from the same browser count at most once every 30 seconds. Unique visitors are counted once per link. A click is not proof of an install or purchase.</p>
                {clicks.map((link) => (
                  <div key={link.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <b>{Number(link.click_count || 0).toLocaleString()} clicks</b>
                    {" · "}
                    {Number(link.unique_click_count || 0).toLocaleString()} unique
                    <br />
                    <small>{link.target_url}</small>
                  </div>
                ))}
              </div>
            )}

            {actionBased && (
              <div className="quick">
                <h2>{paymentMethod === "cpi" ? "Recent verified installs" : "Recent verified conversions"}</h2>
                {conversionEvents.length ? conversionEvents.map((event) => (
                  <div key={event.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <b>{String(event.action_type || "conversion").replaceAll("_", " ")}</b>
                    <p>Reference: {event.external_conversion_id}</p>
                    <small>{event.status} · {event.created_at ? new Date(event.created_at).toLocaleString() : "Recorded"}</small>
                    <p>Reported value: {Number(event.value || 0).toLocaleString()}</p>
                  </div>
                )) : <p>No verified conversion events yet.</p>}
              </div>
            )}

            {submissions.length > 0 && (
              <div className="quick">
                <h2>Creator videos</h2>
                {submissions.map((submission) => (
                  <div key={submission.id} style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <b>{submission.tracking_platform || "Platform"}</b>
                    <p>{Number(submission.current_metric || 0).toLocaleString()} / {Number(submission.target_metric || campaign.desired_results || 0).toLocaleString()} views · {submission.metric_status || "pending"}</p>
                    {submission.last_metric_check_at && <small>Last checked {new Date(submission.last_metric_check_at).toLocaleString()}</small>}
                    <br />
                    <a href={submission.posted_url || "#"} target="_blank" rel="noreferrer">Open published video →</a>
                  </div>
                ))}
              </div>
            )}

            <div className="quick">
              <h2>Campaign budget</h2>
              <p>₦{Number(campaign.max_budget || 0).toLocaleString()} maximum budget · ₦{Number(campaign.payment_rate || 0).toLocaleString()} per result</p>
              <Link href="/advertiser/review">Review creator work →</Link>
            </div>
          </>
        ) : <div className="successBox">Select a campaign from Your Campaigns.</div>}
      </div>
    </main>
  );
}
