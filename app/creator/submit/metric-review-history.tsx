"use client";

import { useEffect, useState } from "react";
import { loadCreatorMetricReviewHistory } from "@/lib/creator-metric-review-history";
import type {
  CreatorMetricReviewHistoryCursor,
  CreatorMetricReviewHistoryItem,
} from "@/lib/creator-metric-review-history.mjs";

function formatCount(value: string | null) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat().format(BigInt(value));
  } catch {
    return value;
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not reviewed yet";
}

function statusLabel(status: CreatorMetricReviewHistoryItem["status"]) {
  if (status === "approved") return "EVIDENCE ACCEPTED";
  if (status === "rejected") return "EVIDENCE REJECTED";
  return "AWAITING REVIEW";
}

export function CreatorMetricReviewHistory({ submissionId }: { submissionId: string }) {
  const [items, setItems] = useState<CreatorMetricReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<CreatorMetricReviewHistoryCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    if (!submissionId) return;
    setLoading(true);
    setError("");
    try {
      const page = await loadCreatorMetricReviewHistory(submissionId, null);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      setItems([]);
      setCursor(null);
      setError(cause instanceof Error ? cause.message : "Your evidence history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const page = await loadCreatorMetricReviewHistory(submissionId, cursor);
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !existing.has(item.id))];
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Older evidence history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      if (!submissionId) return;
      setLoading(true);
      setError("");
      try {
        const page = await loadCreatorMetricReviewHistory(submissionId, null);
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (cause) {
        if (!active) return;
        setItems([]);
        setCursor(null);
        setError(cause instanceof Error ? cause.message : "Your evidence history could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [submissionId]);

  if (!submissionId) return null;

  return (
    <section className="creatorMetricHistory">
      <div className="sectionHead">
        <h2>Manual CPM evidence history</h2>
        <button className="secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading && items.length === 0 ? "Loading…" : "Refresh history"}
        </button>
      </div>
      <p>Only you can view this evidence history. An accepted metric is separate from a payment release; check your earnings ledger for released amounts.</p>
      {error && <div className="successBox" role="alert">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="successBox">No manual CPM evidence has been submitted for this campaign yet.</div>
      )}
      <div className="opps" aria-live="polite">
        {items.map((item) => (
          <article key={item.id}>
            <div className="sectionHead">
              <b>{statusLabel(item.status)}</b>
              <small>Submitted {formatDate(item.createdAt)}</small>
            </div>
            <div className="statsGrid">
              <div><b>CLAIMED VIEWS</b><strong>{formatCount(item.claimedMetric)}</strong></div>
              <div><b>CAMPAIGN TARGET</b><strong>{formatCount(item.targetMetric)}</strong></div>
            </div>
            {item.evidenceUrl && (
              <p><a className="secondary" href={item.evidenceUrl} target="_blank" rel="noreferrer noopener">Open your submitted evidence ↗</a></p>
            )}
            {item.creatorNote && <p><b>Your note:</b> {item.creatorNote}</p>}
            {item.status === "pending" && <p>Your evidence is waiting for an administrator decision.</p>}
            {item.reviewNote && (
              <div className="infoBox">
                <b>AdBridge review feedback</b>
                <p>{item.reviewNote}</p>
              </div>
            )}
            <small>Decision: {formatDate(item.reviewedAt)}</small>
            {item.status === "approved" && <p>Evidence accepted. Any eligible CPM payment is recorded separately in your earnings ledger.</p>}
            {item.status === "rejected" && <p>Review the feedback above before submitting corrected evidence, if the campaign is still eligible.</p>}
          </article>
        ))}
      </div>
      {cursor && (
        <button className="secondary" type="button" onClick={() => void loadOlder()} disabled={loading}>
          {loading ? "Loading…" : "Load older evidence"}
        </button>
      )}
    </section>
  );
}
