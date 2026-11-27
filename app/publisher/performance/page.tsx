"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";
import { loadPublisherPerformance, type PublisherPerformance } from "@/lib/publisher-performance";

const number = (value: number) => value.toLocaleString("en-NG");
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function PublisherPerformancePage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<PublisherPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setReport(null);
      setError("AdBridge database is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }
      const next = await loadPublisherPerformance(supabase, days);
      setReport(next);
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "Verified publisher performance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="dashboard">
      <div className="topbar">
        <Link href="/publisher">← Publisher Dashboard</Link>
        <span className="pill">Publisher</span>
        <NotificationBell />
      </div>
      <section className="hero">
        <p className="eyebrow">VERIFIED INVENTORY PERFORMANCE</p>
        <h1>Your delivery. <em>Measured honestly.</em></h1>
        <p>Only server-assessed publisher placement events appear here. Verified activity, payable activity, events under review and blocked events are shown separately. Browser-only telemetry is not presented as verified delivery.</p>
      </section>

      <section className="quick">
        <div className="choiceRow">
          <div>
            <h2>Delivery summary</h2>
            <p>Choose a reporting window. The report is scoped to your authenticated publisher account.</p>
          </div>
          <div className="choiceRow">
            <select className="textInput" aria-label="Reporting window" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button className="secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
          </div>
        </div>

        {error && <div className="successBox" role="alert">{error} <button className="secondary" type="button" onClick={() => void load()}>Retry</button></div>}
        {loading && <div className="successBox">Loading verified delivery metrics…</div>}

        {!loading && !error && report && <>
          <div className="grid">
            <div className="card"><strong>Received events</strong><h2>{number(report.total_events)}</h2></div>
            <div className="card"><strong>Verified events</strong><h2>{number(report.verified_events)}</h2></div>
            <div className="card"><strong>Payable events</strong><h2>{number(report.payable_events)}</h2></div>
            <div className="card"><strong>Under review</strong><h2>{number(report.under_review_events)}</h2></div>
            <div className="card"><strong>Blocked</strong><h2>{number(report.blocked_events)}</h2></div>
            <div className="card"><strong>Rejected</strong><h2>{number(report.rejected_events)}</h2></div>
          </div>

          {!report.total_events && <div className="notificationEmpty"><h2>No verified publisher events yet</h2><p>After an approved placement begins delivering and its server-signed events are assessed, aggregate results will appear here. No sample or estimated activity is inserted.</p><Link href="/publisher/integration">Review server integration →</Link></div>}

          {report.event_types.length > 0 && <section className="quick">
            <h2>By event type</h2>
            <div className="opps">{report.event_types.map((item) => <article key={item.event_type}>
              <div className="choiceRow"><b>{label(item.event_type)}</b><strong>{number(item.total)} received</strong></div>
              <div className="statsGrid">
                <div><b>VERIFIED</b><strong>{number(item.verified)}</strong></div>
                <div><b>PAYABLE</b><strong>{number(item.payable)}</strong></div>
                <div><b>UNDER REVIEW</b><strong>{number(item.under_review)}</strong></div>
                <div><b>BLOCKED</b><strong>{number(item.blocked)}</strong></div>
                <div><b>REJECTED</b><strong>{number(item.rejected)}</strong></div>
              </div>
            </article>)}</div>
          </section>}

          {report.daily.length > 0 && <section className="quick">
            <h2>Daily delivery history</h2>
            <div className="opps">{report.daily.slice().reverse().map((item) => <article key={item.day}>
              <div className="choiceRow"><b>{new Date(item.day + "T00:00:00Z").toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "UTC" })}</b><strong>{number(item.total)} events</strong></div>
              <p>{number(item.verified)} verified · {number(item.payable)} payable · {number(item.under_review)} under review · {number(item.blocked)} blocked · {number(item.rejected)} rejected</p>
            </article>)}</div>
          </section>}

          <p><small>Generated {new Date(report.generated_at).toLocaleString("en-NG")}. This report contains aggregate counts only; it does not expose visitor identifiers, IP hashes, session hashes, fraud evidence or other publishers' activity.</small></p>
        </>}
      </section>
    </main>
  );
}
