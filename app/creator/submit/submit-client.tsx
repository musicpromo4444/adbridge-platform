"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeManualMetricInput } from "@/lib/manual-metric-review.mjs";
import { submitManualMetricEvidence } from "@/lib/manual-metric-review-client";
import { CreatorMetricReviewHistory } from "./metric-review-history";
import { normalizeSocialPostUrl } from "@/lib/social-post-url.mjs";



const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export default function Submit() {
  const params = useSearchParams();
  const job = params.get("job") || "";
  const retrySubmissionId = params.get("submission") || "";
  const retryMode = params.get("metric") === "retry" && !!retrySubmissionId;
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
  const [retryBlockedMessage, setRetryBlockedMessage] = useState("");
  const [latestReviewNote, setLatestReviewNote] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPaymentMethod() {
      if (!supabase) return;
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }

      if (retryMode) {
        const { data: result, error: rpcError } = await supabase.rpc("submit_creator_campaign_work", {
      p_job_id: job,
      p_posted_url: normalizedPostUrl,
      p_tracking_platform: platform.toLowerCase(),
      p_note: note.trim() || null,
      p_evidence: evidence.trim() || null,
    });
    if (rpcError || !result?.submission_id) {
      setError(rpcError?.message || "Submission failed. Nothing was submitted.");
      setSaving(false);
      return;
    }

    const submissionId = String(result.submission_id);
    setSavedSubmissionId(submissionId);
    if (result.tracking_slug) {
      setTrackingUrl(window.location.origin + "/go/" + result.tracking_slug);
    }

    if (manualMetricInput) {
      try {
        await submitManualMetricEvidence(supabase, {
          submissionId,
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

    setSent(true);
    setSaving(false);
  }

  return (
    <main className="formPage">
      <Link href="/creator/work" className="back">← My Work</Link>
      <div className="formCard">
        {retryMode ? (
          <>
            <span className="eyebrow">UPDATE CPM METRIC EVIDENCE</span>
            <h1>Submit corrected <em>evidence.</em></h1>
            <p>This updates the existing campaign submission. It does not create another creator job or new campaign submission.</p>
            {retryBlockedMessage && <div className="successBox" role="alert">{retryBlockedMessage}</div>}
            {latestReviewNote && <div className="infoBox"><b>Latest review feedback</b><p>{latestReviewNote}</p></div>}
            <label>Current whole-number view count</label>
            <input className="textInput" value={claimedMetric} onChange={event => setClaimedMetric(event.target.value)} inputMode="numeric" placeholder="e.g. 12500" disabled={saving || sent || !!retryBlockedMessage} />
            <label>Public insights / evidence URL</label>
            <input className="textInput" value={metricEvidenceUrl} onChange={event => setMetricEvidenceUrl(event.target.value)} placeholder="https://..." disabled={saving || sent || !!retryBlockedMessage} />
            <label>Note for AdBridge review</label>
            <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Explain what changed or where the evidence can be checked…" disabled={saving || sent || !!retryBlockedMessage} />
            {error && <div className="successBox" role="alert">{error}</div>}
            {manualMetricError && <div className="successBox" role="alert">{manualMetricError}</div>}
            <button className="primary" type="button" disabled={saving || sent || !!retryBlockedMessage} onClick={() => void submit()}>
              {saving ? "Sending…" : sent ? "Updated evidence submitted ✓" : "Submit updated evidence →"}
            </button>
            {sent && <div className="successBox">Updated manual metric evidence was sent for review. Any eligible payment remains subject to verified target and funded-budget checks.</div>}
            <CreatorMetricReviewHistory submissionId={retrySubmissionId} />
          </>
        ) : (
          <>
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
                <input className="textInput" value={claimedMetric} onChange={event => setClaimedMetric(event.target.value)} inputMode="numeric" placeholder="e.g. 12500" disabled={sent} />
                <label>Public insights / evidence URL</label>
                <input className="textInput" value={metricEvidenceUrl} onChange={event => setMetricEvidenceUrl(event.target.value)} placeholder="https://..." disabled={sent} />
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
                {(manualMetricSaved || manualMetricError) && savedSubmissionId && (
                  <CreatorMetricReviewHistory submissionId={savedSubmissionId} />
                )}
              </>
            )}
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
