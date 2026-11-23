"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeManualMetricInput, submitManualMetricEvidence } from "@/lib/manual-metric-review.mjs";

const hosts: { [key: string]: string[] } = {
  TikTok: ["tiktok.com"],
  "Instagram Reels": ["instagram.com"],
  Instagram: ["instagram.com"],
  YouTube: ["youtube.com", "youtu.be"],
  "YouTube Shorts": ["youtube.com", "youtu.be"],
  Facebook: ["facebook.com"],
  "Facebook Reels": ["facebook.com"],
  X: ["x.com", "twitter.com"],
  Snapchat: ["snapchat.com"],
};

export default function Submit() {
  const params = useSearchParams();
  const job = params.get("job") || "";
  const [posted, setPosted] = useState("");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [claimedMetric, setClaimedMetric] = useState("");
  const [metricEvidenceUrl, setMetricEvidenceUrl] = useState("");
  const [savedSubmissionId, setSavedSubmissionId] = useState("");
  const [manualMetricSaved, setManualMetricSaved] = useState(false);
  const [manualMetricError, setManualMetricError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPaymentMethod() {
      if (!supabase || !job) return;
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;
      const { data: creatorJob } = await supabase
        .from("creator_campaigns")
        .select("campaign_id")
        .eq("id", job)
        .eq("creator_id", user.id)
        .maybeSingle();
      if (!creatorJob) return;
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("payment_method")
        .eq("id", creatorJob.campaign_id)
        .maybeSingle();
      if (active && campaign) setMethod(String(campaign.payment_method || ""));
    }
    void loadPaymentMethod();
    return () => { active = false; };
  }, [job]);

  const isCpm = ["cpm", "views"].includes(method.toLowerCase());
  const special = ["product_placement", "brand_mention", "partnership", "job", "placement"].includes(method.toLowerCase());

  async function saveManualEvidence(submissionId: string) {
    if (!supabase) throw new Error("Database connection is not ready.");
    const normalized = normalizeManualMetricInput(claimedMetric, metricEvidenceUrl);
    await submitManualMetricEvidence(supabase, {
      submissionId,
      claimedMetric: normalized.claimedMetric,
      evidenceUrl: normalized.evidenceUrl,
      note: note.trim() || null,
    });
    setManualMetricSaved(true);
    setManualMetricError("");
  }

  async function retryManualEvidence() {
    if (!savedSubmissionId || saving) return;
    setSaving(true);
    setManualMetricError("");
    try {
      await saveManualEvidence(savedSubmissionId);
    } catch (retryError) {
      setManualMetricError(retryError instanceof Error ? retryError.message : "Manual evidence could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!supabase || !job) {
      setError("Open this page from an accepted campaign.");
      return;
    }
    let publicUrl: URL;
    try {
      publicUrl = new URL(posted.trim());
      if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error("protocol");
    } catch {
      setError("Enter a valid public post URL.");
      return;
    }
    if (!hosts[platform]?.some(host => publicUrl.hostname === host || publicUrl.hostname.endsWith("." + host))) {
      setError("That link does not match the selected platform.");
      return;
    }

    setSaving(true);
    setError("");
    setManualMetricError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Please sign in again.");
      setSaving(false);
      return;
    }

    const { data: creatorJob, error: jobError } = await supabase
      .from("creator_campaigns")
      .select("id,campaign_id,creator_id,status")
      .eq("id", job)
      .eq("creator_id", user.id)
      .single();
    if (jobError || !creatorJob) {
      setError("Campaign job not found.");
      setSaving(false);
      return;
    }
    if (["submitted", "approved", "completed"].includes(creatorJob.status)) {
      setError("This campaign has already been submitted.");
      setSaving(false);
      return;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("payment_method,desired_results,platform,status")
      .eq("id", creatorJob.campaign_id)
      .single();
    if (campaignError || !campaign) {
      setError("Campaign details could not be loaded.");
      setSaving(false);
      return;
    }
    if (!["active", "funded"].includes(String(campaign.status))) {
      setError("This campaign is not accepting submissions yet.");
      setSaving(false);
      return;
    }

    const paymentMethod = String(campaign.payment_method || "");
    const cpmCampaign = ["cpm", "views"].includes(paymentMethod.toLowerCase());
    let manualMetricInput: { claimedMetric: number; evidenceUrl: string } | null = null;
    if (cpmCampaign && (claimedMetric.trim() || metricEvidenceUrl.trim())) {
      try {
        manualMetricInput = normalizeManualMetricInput(claimedMetric, metricEvidenceUrl);
      } catch (inputError) {
        setError(inputError instanceof Error ? inputError.message : "Check the manual metric evidence.");
        setSaving(false);
        return;
      }
    }
    setMethod(paymentMethod);

    const targetMetric = cpmCampaign ? Number(campaign.desired_results || 0) : null;
    const isSpecial = ["product_placement", "brand_mention", "partnership", "job", "placement"].includes(paymentMethod.toLowerCase());
    const finalNote = isSpecial
      ? [note.trim(), evidence.trim() ? "Proof/evidence: " + evidence.trim() : ""].filter(Boolean).join("\n")
      : note.trim();

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        campaign_id: creatorJob.campaign_id,
        creator_id: user.id,
        creator_campaign_id: creatorJob.id,
        posted_url: posted.trim(),
        note: finalNote,
        status: "waiting",
        tracking_platform: platform.toLowerCase(),
        target_metric: targetMetric,
        current_metric: 0,
        metric_status: targetMetric ? "pending" : "not_required",
      })
      .select("id")
      .single();

    if (submissionError || !submission) {
      setError(submissionError?.message || "Submission failed.");
      setSaving(false);
      return;
    }

    setSavedSubmissionId(submission.id);

    if (manualMetricInput) {
      try {
        await submitManualMetricEvidence(supabase, {
          submissionId: submission.id,
          claimedMetric: manualMetricInput.claimedMetric,
          evidenceUrl: manualMetricInput.evidenceUrl,
          note: note.trim() || null,
        });
        setManualMetricSaved(true);
      } catch (metricError) {
        setManualMetricError(metricError instanceof Error
          ? metricError.message
          : "Your work was submitted, but manual metric evidence could not be saved. Retry before leaving this page.");
      }
    }

    if (["cpc", "link_traffic", "cpi", "cpa"].includes(paymentMethod.toLowerCase())) {
      const { data: destination } = await supabase
        .from("campaign_destination_urls")
        .select("target_url")
        .eq("campaign_id", creatorJob.campaign_id)
        .maybeSingle();
      if (destination?.target_url) {
        const slug = "c_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
        const { error: linkError } = await supabase.from("tracking_links").insert({
          campaign_id: creatorJob.campaign_id,
          creator_id: user.id,
          submission_id: submission.id,
          slug,
          target_url: destination.target_url,
        });
        if (!linkError) setTrackingUrl(window.location.origin + "/go/" + slug);
      }
    }

    const { error: statusError } = await supabase.rpc("mark_creator_campaign_submitted", {
      p_job_id: job,
    });
    if (statusError) {
      setError(statusError.message || "The submission was saved but the campaign status could not be updated.");
      setSaving(false);
      return;
    }

    setSent(true);
    setSaving(false);
  }

  return (
    <main className="formPage">
      <Link href="/creator/work" className="back">← My Work</Link>
      <div className="formCard">
        <span className="eyebrow">SEND COMPLETED WORK</span>
        <h1>Ready to <em>submit?</em></h1>
        <p>Submit the public link. AdBridge verifies results where the configured platform integration supports it.</p>

        <label>Platform</label>
        <select className="textInput" value={platform} onChange={event => setPlatform(event.target.value)} disabled={sent}>
          {Object.keys(hosts).map(value => <option key={value}>{value}</option>)}
        </select>

        <label>Published work link</label>
        <input className="textInput" value={posted} onChange={event => setPosted(event.target.value)} placeholder="https://tiktok.com/..." disabled={sent} />

        {platform === "Snapchat" && (
          <>
            <label>Evidence / Insights link</label>
            <input className="textInput" value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Paste eligible Insights evidence link" disabled={sent} />
          </>
        )}

        {special && (
          <>
            <label>Proof / evidence</label>
            <input className="textInput" value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Optional screenshot, transcript or proof link" disabled={sent} />
          </>
        )}

        {isCpm && (
          <div className="infoBox">
            <b>Optional manual view evidence</b>
            <p>If AdBridge cannot retrieve views automatically for this platform, you may submit the current whole-number view count and a public insights/evidence URL. AdBridge reviews this separately; an accepted metric does not guarantee a payout.</p>
            <label>Current view count</label>
            <input
              className="textInput"
              value={claimedMetric}
              onChange={event => setClaimedMetric(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 12500"
              disabled={sent}
            />
            <label>Public insights / evidence URL</label>
            <input
              className="textInput"
              value={metricEvidenceUrl}
              onChange={event => setMetricEvidenceUrl(event.target.value)}
              placeholder="https://..."
              disabled={sent}
            />
          </div>
        )}

        <label>{special ? "Add a note for AdBridge review" : "Anything AdBridge should know?"}</label>
        <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Optional note" disabled={sent} />

        {error && <div className="successBox" role="alert">{error}</div>}
        {manualMetricError && <div className="successBox" role="alert">{manualMetricError}</div>}

        <button className="primary" disabled={saving || sent} onClick={() => void submit()}>
          {saving ? "Sending…" : sent ? "Sent for approval ✓" : "Send for approval →"}
        </button>

        {sent && (
          <>
            <div className="successBox">
              <b>Submission received.</b>
              <br />
              {trackingUrl && <>Your unique campaign link: <a href={trackingUrl} target="_blank" rel="noreferrer noopener">{trackingUrl}</a><br />Use this link wherever you promote the campaign.<br /></>}
              {manualMetricSaved
                ? "Manual view evidence was sent for AdBridge review. Any eligible CPM payment will appear separately in your earnings ledger."
                : manualMetricError
                  ? "Your campaign work was submitted, but manual metric evidence still needs to be saved."
                  : cpmCampaignText(method)}
            </div>
            {manualMetricError && savedSubmissionId && (
              <button className="secondary" type="button" disabled={saving} onClick={() => void retryManualEvidence()}>
                {saving ? "Retrying…" : "Retry manual evidence"}
              </button>
            )}
            <Link className="secondary" href="/creator/work">Back to my work →</Link>
          </>
        )}
      </div>
    </main>
  );
}

function cpmCampaignText(paymentMethod: string) {
  return ["cpm", "views"].includes(paymentMethod.toLowerCase())
    ? "AdBridge will check supported platform metrics. Manual evidence can be submitted when automatic metrics are unavailable."
    : "AdBridge will verify tracked results according to the campaign model.";
}
