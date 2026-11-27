"use client";

import { useEffect, useState } from "react";
import { loadAdminMetricReviewHistory } from "@/lib/admin-metric-review-history";
import type {
  AdminMetricReviewHistoryCursor,
  AdminMetricReviewHistoryItem,
} from "@/lib/admin-metric-review-history.mjs";

function formatCount(value: string | null) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat().format(BigInt(value));
  } catch {
    return value;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminMetricReviewHistory() {
  const [items, setItems] = useState<AdminMetricReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<AdminMetricReviewHistoryCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const page = await loadAdminMetricReviewHistory(null);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      setItems([]);
      setCursor(null);
      setError(cause instanceof Error ? cause.message : "Review history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const page = await loadAdminMetricReviewHistory(cursor);
      setItems(current => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Older review decisions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section>
      <div className="sectionHead">
        <h2>Manual CPM review history</h2>
        <button className="secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading && items.length === 0 ? "Loading…" : "Refresh history"}
        </button>
      </div>
      <p>Recent accepted and rejected manual view-evidence decisions. This history does not expose creator or reviewer identity.</p>
      {error && <div className="successBox" role="alert">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="successBox">No completed manual CPM evidence reviews yet.</div>
      )}
      <div className="opps">
        {items.map(item => (
          <article key={item.id}>
            <div className="sectionHead">
              <b>{item.status === "approved" ? "EVIDENCE ACCEPTED" : "EVIDENCE REJECTED"}</b>
              <small>{formatDate(item.reviewedAt)}</small>
            </div>
            <h3>{item.campaignName}</h3>
            <p>{item.trackingPlatform || "Platform not recorded"} · Manual CPM evidence</p>
            <div className="statsGrid">
              <div><b>CREATOR CLAIM</b><strong>{formatCount(item.claimedMetric)}</strong></div>
              <div><b>CAMPAIGN TARGET</b><strong>{formatCount(item.targetMetric)}</strong></div>
              <div><b>SAVED METRIC</b><strong>{formatCount(item.currentMetric)}</strong></div>
            </div>
            {item.evidenceUrl
              ? <p><a className="secondary" href={item.evidenceUrl} target="_blank" rel="noreferrer noopener">Open reviewed evidence ↗</a></p>
              : <p className="fieldHint">No safe HTTP(S) evidence URL is available.</p>}
            {item.creatorNote && <p><b>Creator note:</b> {item.creatorNote}</p>}
            {item.reviewNote && <div className="infoBox"><b>Review feedback</b><p>{item.reviewNote}</p></div>}
            <small>Submitted {formatDate(item.createdAt)} · Evidence decision is separate from creator payment release.</small>
          </article>
        ))}
      </div>
      {cursor && (
        <button className="secondary" type="button" onClick={() => void loadOlder()} disabled={loading}>
          {loading ? "Loading…" : "Load older decisions"}
        </button>
      )}
    </section>
  );
}
