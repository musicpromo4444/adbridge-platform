"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type IntegrationStatus = {
  checked_at: string;
  payments: { paystack: boolean; paystack_webhook_url: string };
  application: { app_url: boolean };
  ai: { creator_post_assistant: boolean; video_placement_analysis: boolean };
  social: Record<string, boolean>;
  tracking: {
    click_proxy_secret: boolean;
    cpa_postback_secret: boolean;
    metrics_scheduler_secret: boolean;
  };
};

const names: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  meta: "Instagram / Facebook",
  x: "X",
  snapchat: "Snapchat",
};

function Status({ ready }: { ready: boolean }) {
  return <strong style={{ color: ready ? "#18794e" : "#b42318" }}>{ready ? "CONFIGURED" : "MISSING"}</strong>;
}

export default function Integrations() {
  const [report, setReport] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    if (!supabase) {
      setError("Database connection is not configured.");
      setLoading(false);
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      location.href = "/login";
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") {
      location.href = "/";
      return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("admin-integration-readiness", { body: {} });
    if (invokeError || !data) {
      setError("Provider status could not be verified. No integration has been marked ready.");
    } else {
      setReport(data as IntegrationStatus);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="formPage">
      <Link href="/admin" className="back">← Admin Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADMIN · INTEGRATIONS</span>
        <h1>Provider <em>readiness.</em></h1>
        <p>Live status is read from server-side credentials. This page does not let anyone mark an integration configured without adding and verifying its real credentials.</p>
        <button className="secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Checking…" : "Refresh provider checks"}</button>
        {error && <div className="successBox" role="alert">{error}</div>}
        {loading && <div className="successBox">Checking provider credentials securely…</div>}
        {report && <>
          <section className="quick">
            <h2>Payments and application</h2>
            <div className="statsGrid">
              <div><b>PAYSTACK</b><Status ready={report.payments.paystack} /><small>Server-side payment initialization and verification</small></div>
              <div><b>APP URL</b><Status ready={report.application.app_url} /><small>HTTPS callback and redirect base URL</small></div>
            </div>
            <div className="infoBox">
              <b>Paystack webhook endpoint</b>
              <p style={{ overflowWrap: "anywhere" }}>{report.payments.paystack_webhook_url}</p>
              <button className="secondary" type="button" onClick={() => void navigator.clipboard.writeText(report.payments.paystack_webhook_url)}>Copy webhook URL</button>
            </div>
          </section>
          <section className="quick">
            <h2>Social account connections</h2>
            <div className="opps">{Object.entries(report.social).map(([key, ready]) =>
              <article className="infoBox" key={key}><div className="choiceRow"><b>{names[key] || key}</b><Status ready={ready} /></div><small>{ready ? "Required client credentials are present. A real OAuth connection test is still required." : "Required client ID and/or secret is missing from Supabase Edge Function Secrets."}</small></article>
            )}</div>
          </section>
          <section className="quick">
            <h2>AI and tracking services</h2>
            <div className="opps">
              <article className="infoBox"><b>AI creator post assistant</b><Status ready={report.ai.creator_post_assistant} /></article>
              <article className="infoBox"><b>AI video placement analysis</b><Status ready={report.ai.video_placement_analysis} /></article>
              <article className="infoBox"><b>Private click proxy secret</b><Status ready={report.tracking.click_proxy_secret} /></article>
              <article className="infoBox"><b>CPA conversion postback secret</b><Status ready={report.tracking.cpa_postback_secret} /></article>
              <article className="infoBox"><b>Metrics scheduler secret</b><Status ready={report.tracking.metrics_scheduler_secret} /></article>
            </div>
          </section>
          <small>Checked {new Date(report.checked_at).toLocaleString()}. Secret values are never returned to the browser. Presence alone does not prove a provider account or live transaction works.</small>
        </>}
        <div className="choiceRow"><Link className="secondary" href="/admin/launch">Full launch checklist →</Link><Link className="secondary" href="/admin">Admin dashboard →</Link></div>
      </div>
    </main>
  );
}
