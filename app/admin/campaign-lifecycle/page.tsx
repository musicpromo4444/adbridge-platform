"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { completionReasonLabel, completionReasonSummary } from "@/lib/campaign-lifecycle";
import {
  loadAdminCampaignLifecycleOverview,
  reconcileAdminCampaignBudget
} from "@/lib/admin-campaign-lifecycle";
import type {
  AdminCampaignLifecycleCampaign,
  AdminCampaignLifecycleOverview,
  CampaignLifecycleFilter
} from "@/lib/admin-campaign-lifecycle.mjs";

const filters: CampaignLifecycleFilter[] = [
  "all", "active", "funded", "completed", "paused", "draft", "closed", "cancelled"
];

function money(value: number): string {
  return "₦" + Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export default function AdminCampaignLifecycle() {
  const [filter, setFilter] = useState<CampaignLifecycleFilter>("all");
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState<AdminCampaignLifecycleOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setOverview(null);
    try {
      setOverview(await loadAdminCampaignLifecycleOverview(filter));
    } catch {
      setError("Campaign lifecycle data could not be loaded. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const visibleCampaigns = useMemo(() => {
    const rows = overview?.campaigns || [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => [
      row.id,
      row.name || "",
      row.goal || "",
      row.platform || "",
      row.payment_method || "",
      row.status,
      row.completion_reason || ""
    ].join(" ").toLowerCase().includes(term));
  }, [overview, query]);

  async function reconcileBudget(row: AdminCampaignLifecycleCampaign) {
    if (!row.needs_reconciliation || reconcilingId !== null) return;
    const confirmed = window.confirm(
      "Recheck the committed creator-payment ledger for \"" + (row.name || "this campaign") +
      "\"? The campaign will be completed only if the locked ledger still shows that another payable result cannot be funded."
    );
    if (!confirmed) return;

    setReconcilingId(row.id);
    setActionMessage("");
    setActionError("");
    try {
      const result = await reconcileAdminCampaignBudget(row.id);
      let message = "";
      if (result.changed) {
        message = "Campaign \"" + (row.name || row.id) + "\" was completed after the server confirmed budget exhaustion. Owner notifications were handled by the database trigger.";
      } else if (result.outcome === "not_exhausted") {
        message = "The latest locked ledger can still fund the next payable result. The campaign was left unchanged.";
      } else if (result.outcome === "unsupported_payment_method") {
        message = "The payment method is not recognized. The campaign was left unchanged for manual review.";
      } else {
        message = "The campaign is no longer eligible for budget reconciliation. Its current status was not changed.";
      }
      await load();
      setActionMessage(message);
    } catch {
      setActionError("Budget reconciliation failed. No success is assumed; refresh the lifecycle monitor and inspect the campaign ledger.");
    } finally {
      setReconcilingId(null);
    }
  }

  function renderCampaign(row: AdminCampaignLifecycleCampaign) {
    return (
      <article key={row.id}>
        <div className="formatBadgeRow">
          <span className="formatBadge">{row.status.replaceAll("_", " ").toUpperCase()}</span>
          {row.needs_reconciliation && <span className="formatBadge">BUDGET REVIEW</span>}
        </div>
        <h3>{row.name || "Unnamed campaign"}</h3>
        <p>{row.goal || "No goal recorded"} · {row.platform || "Platform not specified"} · {row.payment_method || "Payment method not recorded"}</p>
        <div className="statsGrid">
          <div><b>Maximum budget</b><strong>{money(row.max_budget)}</strong></div>
          <div><b>Confirmed funding</b><strong>{money(row.funded_amount)}</strong></div>
          <div><b>Committed creator spend</b><strong>{money(row.committed_spend)}</strong><small>Pending, held and released ledger entries</small></div>
          <div><b>Remaining funded budget</b><strong>{money(row.remaining_funded_budget)}</strong></div>
        </div>
        <div className="infoBox">
          <b>Next payable result</b>
          <p>
            {row.required_next_result === null
              ? "The payment method is not recognized by the lifecycle guard."
              : money(row.required_next_result)}
          </p>
          {row.can_fund_next_result === true && <small>The remaining funded budget can cover at least one more payable result.</small>}
          {row.can_fund_next_result === false && <small>The remaining funded budget cannot cover another payable result at the configured rate.</small>}
        </div>
        {row.needs_reconciliation && (
          <div className="successBox" role="alert">
            <b>Budget reconciliation required.</b>
            <p>This campaign is still active although its remaining funded budget cannot cover another payable result. The action below rechecks the locked ledger before changing campaign state.</p>
            <button
              type="button"
              className="primary"
              onClick={() => void reconcileBudget(row)}
              disabled={reconcilingId !== null || loading}
            >
              {reconcilingId === row.id ? "Reconciling…" : "Reconcile campaign budget"}
            </button>
          </div>
        )}
        {row.status === "completed" && (
          <div className="successBox">
            <b>Completion reason: {completionReasonLabel(row.completion_reason)}</b>
            <p>{completionReasonSummary(row.completion_reason)}</p>
            {row.completed_at && <small>Completed {new Date(row.completed_at).toLocaleString()}.</small>}
          </div>
        )}
        <small>Campaign created {new Date(row.created_at).toLocaleString()} · Target {row.desired_results ?? "not set"}</small>
        <div className="choiceRow">
          <Link className="secondary" href="/admin/campaigns">Open campaign controls →</Link>
        </div>
      </article>
    );
  }

  const summary = overview?.summary;

  return (
    <main className="formPage">
      <div className="dashTop">
        <Link href="/admin" className="back">← Admin</Link>
        <span className="testBadge">CAMPAIGN LIFECYCLE MONITOR</span>
        <Link href="/admin/campaigns" className="switch">Campaign controls →</Link>
      </div>
      <div className="formCard wide">
        <span className="eyebrow">ADMIN · DELIVERY & BUDGET CONTROL</span>
        <h1>Campaign <em>lifecycle monitor.</em></h1>
        <p>Inspect campaign status, committed creator spend, remaining funded budget and persisted completion reasons. Budget reconciliation is an explicit admin action; it does not approve payments or release creator earnings.</p>

        {summary && (
          <div className="statsGrid">
            <div><b>All campaigns</b><strong>{summary.total}</strong></div>
            <div><b>Active</b><strong>{summary.active}</strong></div>
            <div><b>Completed</b><strong>{summary.completed}</strong></div>
            <div><b>Need budget review</b><strong>{summary.needs_reconciliation}</strong></div>
          </div>
        )}

        <div className="choiceRow">
          {filters.map(status => (
            <button
              key={status}
              type="button"
              className={filter === status ? "primary" : "secondary"}
              aria-pressed={filter === status}
              onClick={() => { setActionMessage(""); setActionError(""); setFilter(status); }}
            >
              {status === "all" ? "All" : status.replaceAll("_", " ")}
            </button>
          ))}
          <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <input
          className="textInput"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search campaign name, goal, platform or ID"
          aria-label="Search campaigns"
        />

        {actionMessage && <div className="infoBox" role="status" aria-live="polite">{actionMessage}</div>}
        {actionError && <div className="successBox" role="alert">{actionError}</div>}
        {error && <div className="successBox" role="alert">{error}</div>}
        {loading && <div className="successBox">Loading campaign lifecycle…</div>}
        {!loading && overview && (
          <>
            {overview.truncated && <div className="infoBox">Showing the newest 200 matching campaigns. Use a status filter or search to narrow the list.</div>}
            <div className="opps">
              {visibleCampaigns.map(renderCampaign)}
              {!visibleCampaigns.length && <div className="successBox">No campaigns match this filter.</div>}
            </div>
            <small>Read-only snapshot generated {new Date(overview.generated_at).toLocaleString()}.</small>
          </>
        )}
      </div>
    </main>
  );
}
