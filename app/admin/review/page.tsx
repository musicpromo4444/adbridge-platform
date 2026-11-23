"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { reviewManualMetricEvidence } from "@/lib/manual-metric-review-client";

type CampaignSummary = { name: string; payment_method: string | null };
type SubmissionSummary = {
  id: string;
  campaign_id: string;
  target_metric: number | null;
  current_metric: number;
  tracking_platform: string | null;
  posted_url: string | null;
  campaigns: CampaignSummary | CampaignSummary[] | null;
};
type MetricReviewRow = {
  id: string;
  submission_id: string;
  evidence_url: string | null;
  claimed_metric: number | null;
  note: string | null;
  status: string;
  created_at: string;
  submission: SubmissionSummary | null;
};

const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

function safeHttpUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function AdminReview() {
  const [rows, setRows] = useState<any[]>([]);
  const [metricRows, setMetricRows] = useState<MetricReviewRow[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [metricError, setMetricError] = useState("");

  async function load() {
    if (!supabase) {
      setError("Database connection is not ready.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setMetricError("");

    const [submissionsResult, metricResult] = await Promise.all([
      supabase.from("submissions")
        .select("id,campaign_id,creator_id,posted_url,note,status,tracking_platform,created_at,campaigns(name,payment_rate,payment_method)")
        .order("submitted_at", { ascending: false }),
      supabase.from("metric_verifications")
        .select("id,submission_id,evidence_url,claimed_metric,note,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (submissionsResult.error) {
      setError("Could not load submissions. Refresh and try again.");
      setRows([]);
    } else {
      setRows(submissionsResult.data || []);
    }

    if (metricResult.error) {
      setMetricError("Manual CPM evidence could not be loaded. No review action is available until the queue refreshes successfully.");
      setMetricRows([]);
    } else {
      const evidence = metricResult.data || [];
      const ids = evidence.map(item => item.submission_id);
      if (!ids.length) {
        setMetricRows([]);
      } else {
        const { data: related, error: relatedError } = await supabase
          .from("submissions")
          .select("id,campaign_id,target_metric,current_metric,tracking_platform,posted_url,campaigns(name,payment_method)")
          .in("id", ids);
        if (relatedError) {
          setMetricError("The related campaign details for manual metric evidence could not be loaded.");
          setMetricRows([]);
        } else {
          const byId = new Map<string, SubmissionSummary>((related || []).map(item => [item.id, item as unknown as SubmissionSummary] as const));
          setMetricRows(evidence.map(item => ({
            ...item,
            submission: byId.get(item.submission_id) || null,
          })) as MetricReviewRow[]);
        }
      }
    }

    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function reviewMetric(id: string, decision: "approved" | "rejected") {
    if (!supabase || busy) return;
    const reviewNote = (reviewNotes[id] || "").trim();
    if (decision === "rejected" && !reviewNote) {
      setMetricError("Add a short reason before rejecting manual metric evidence.");
      return;
    }

    setBusy(id);
    setError("");
    setMetricError("");
    setMessage("");
    try {
      const result = await reviewManualMetricEvidence(supabase, {
        metricVerificationId: id,
        decision,
        reviewNote: reviewNote || null,
      });
      let nextMessage = decision === "rejected"
        ? "Manual evidence rejected. The creator was notified."
        : "Manual evidence accepted. ";

      if (decision === "approved" && result.payout?.paid) {
        nextMessage += result.payout.duplicate
          ? "An existing CPM payout record was retained; no second payment was created."
          : "An eligible CPM payout was recorded in the creator earnings ledger.";
      } else if (decision === "approved") {
        const reason = result.payout?.reason || "the campaign target or funded-budget checks";
        nextMessage += "No payout was released in this review because " + reason.replaceAll("_", " ") + ". The creator was notified.";
      }

      await load();
      setMessage(nextMessage);
      setReviewNotes(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (reviewError) {
      setMetricError(reviewError instanceof Error
        ? reviewError.message
        : "The manual metric review could not be completed. Refresh and try again.");
    } finally {
      setBusy("");
    }
  }

  async function update(id: string, status: "approved" | "changes_requested") {
    if (!supabase) return;
    setBusy(id);
    setError("");
    setMessage("");
    const { data: result, error: invokeError } = await supabase.functions.invoke("review-submission", {
      body: { submission_id: id, status },
    });
    if (invokeError || result?.error) {
      setError(result?.error || invokeError?.message || "Could not update submission.");
    } else {
      setMessage(status === "approved"
        ? "Submission approved and payment handled by the secure review service."
        : "Changes requested.");
      await load();
    }
    setBusy("");
  }

  return (
    <main className="formPage">
      <Link href="/admin" className="back">← Admin</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADMIN · REVIEW QUEUE</span>
        <h1>Creator work <em>review.</em></h1>
        <p>Review creator submissions and manual CPM metric evidence. Manual evidence decisions are recorded server-side; accepting evidence does not by itself guarantee a payout.</p>

        {error && <div className="successBox" role="alert">{error}</div>}
        {message && <div className="infoBox" role="status" aria-live="polite">✓ {message}</div>}

        <section>
          <div className="sectionHead">
            <h2>Manual CPM metric evidence</h2>
            <button className="secondary" type="button" onClick={() => void load()} disabled={loading || !!busy}>Refresh queue</button>
          </div>
          <p>Creators may submit a public insights/evidence URL when automatic platform metrics are unavailable. Verify the evidence before accepting it. Payment remains subject to the campaign's target and funded budget.</p>
          {metricError && <div className="successBox" role="alert">{metricError}</div>}
          {loading && <div className="successBox">Loading manual metric evidence…</div>}
          {!loading && !metricError && metricRows.length === 0 && <div className="successBox">No manual metric evidence is waiting for review.</div>}
          {!loading && !metricError && metricRows.map(item => {
            const submission = item.submission;
            const campaign = first(submission?.campaigns);
            const evidenceUrl = safeHttpUrl(item.evidence_url);
            return (
              <article key={item.id}>
                <b>MANUAL METRIC · PENDING</b>
                <h3>{campaign?.name || "Campaign"}</h3>
                <p>{submission?.tracking_platform || "Platform not specified"} · {campaign?.payment_method || "CPM"}</p>
                <div className="statsGrid">
                  <div><b>CREATOR-CLAIMED VIEWS</b><strong>{Number(item.claimed_metric || 0).toLocaleString("en-NG")}</strong></div>
                  <div><b>CAMPAIGN TARGET</b><strong>{Number(submission?.target_metric || 0).toLocaleString("en-NG")}</strong></div>
                  <div><b>LAST SAVED PLATFORM COUNT</b><strong>{Number(submission?.current_metric || 0).toLocaleString("en-NG")}</strong></div>
                </div>
                {item.note && <p>Creator note: {item.note}</p>}
                {evidenceUrl
                  ? <p><a className="secondary" href={evidenceUrl} target="_blank" rel="noreferrer noopener">Open submitted metric evidence ↗</a></p>
                  : <p className="fieldHint">No valid HTTP(S) evidence link was saved. Do not approve without reviewing independent evidence.</p>}
                <label htmlFor={"metric-review-note-" + item.id}>Review note (required for rejection; visible to creator)</label>
                <textarea
                  id={"metric-review-note-" + item.id}
                  value={reviewNotes[item.id] || ""}
                  maxLength={500}
                  onChange={event => setReviewNotes(current => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="Explain the decision or what needs correction…"
                />
                <div className="choiceRow">
                  <button
                    type="button"
                    className="primary"
                    disabled={!submission || !evidenceUrl || !!busy}
                    onClick={() => void reviewMetric(item.id, "approved")}
                  >
                    {busy === item.id ? "Saving…" : "Approve evidence"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!submission || !!busy || !(reviewNotes[item.id] || "").trim()}
                    onClick={() => void reviewMetric(item.id, "rejected")}
                  >
                    Reject evidence
                  </button>
                </div>
                <small>Submitted {new Date(item.created_at).toLocaleString()} · Evidence approval is separate from payment release.</small>
              </article>
            );
          })}
        </section>

        <section>
          <div className="sectionHead"><h2>Creator work submissions</h2></div>
          {loading
            ? <div className="successBox">Loading submissions…</div>
            : <div className="opps">
              {rows.map(row => (
                <article key={row.id}>
                  <b>{String(row.status).toUpperCase()}</b>
                  <h3>{row.campaigns?.name || "Campaign"}</h3>
                  <p>Creator: {row.creator_id}</p>
                  <p>{row.note || "No note provided"}</p>
                  {row.tracking_platform === "snapchat" && (
                    <div className="infoBox">
                      <b>Snapchat evidence</b>
                      <p>Review the submitted Snapchat evidence link and public post before approving this submission.</p>
                    </div>
                  )}
                  <a className="secondary" href={row.posted_url} target="_blank" rel="noreferrer noopener">Open submitted work ↗</a>
                  {row.status !== "approved" && (
                    <div className="choiceRow">
                      <button className="primary" disabled={!!busy} onClick={() => void update(row.id, "approved")}>
                        {busy === row.id ? "Saving…" : "Approve"}
                      </button>
                      <button className="secondary" disabled={!!busy} onClick={() => void update(row.id, "changes_requested")}>Request changes</button>
                    </div>
                  )}
                </article>
              ))}
              {!rows.length && <div className="successBox">No submissions yet.</div>}
            </div>}
        </section>
      </div>
    </main>
  );
}
