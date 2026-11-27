"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadCampaignPostbackStatus,
  rotateCampaignPostbackSecret,
  type CampaignPostbackStatus,
} from "@/lib/campaign-postback";

type Campaign = {
  id: string;
  name: string;
  payment_method: string | null;
};

export default function CampaignPostbackSettings() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [status, setStatus] = useState<CampaignPostbackStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase) {
      setError("AdBridge database connection is not available.");
      setLoading(false);
      return;
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data, error: campaignError } = await supabase
      .from("campaigns")
      .select("id,name,payment_method")
      .eq("id", id)
      .eq("advertiser_id", user.id)
      .maybeSingle();

    if (campaignError || !data) {
      setError("Campaign not found or advertiser access is required.");
      setLoading(false);
      return;
    }

    setCampaign(data as Campaign);
    const result = await loadCampaignPostbackStatus(id);
    if (result.error || !result.data) {
      setError(result.error?.message || "Postback status could not be loaded.");
    } else {
      setStatus(result.data);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [id]);

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const endpoint = projectUrl ? projectUrl + "/functions/v1/track-conversion" : "";
  const actionType = String(campaign?.payment_method || "").toLowerCase() === "cpi" ? "install" : "purchase";
  const payload = JSON.stringify({
    campaign_id: id,
    click_id: "{{ADBRIDGE_CLICK_ID}}",
    external_conversion_id: "{{UNIQUE_ORDER_OR_INSTALL_ID}}",
    action_type: actionType,
    value: 0,
  }, null, 2);
  const curlExample = endpoint
    ? "curl --request POST '" + endpoint + "' \\\n  --header 'Content-Type: application/json' \\\n  --header 'x-adbridge-secret: YOUR_CAMPAIGN_POSTBACK_SECRET' \\\n  --data '" + payload.replaceAll("'", "'\\''") + "'"
    : "Set NEXT_PUBLIC_SUPABASE_URL to display the postback endpoint.";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(label + " copied.");
      setError("");
    } catch {
      setError("Clipboard access is unavailable. Select and copy the text manually.");
      setMessage("");
    }
  }

  async function rotate() {
    if (status?.configured && !window.confirm("Rotating this credential immediately invalidates the previous secret. Continue?")) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const result = await rotateCampaignPostbackSecret(id);
    if (result.error || !result.data) {
      setError(result.error?.message || "The postback secret was not confirmed.");
      setBusy(false);
      return;
    }

    setSecret(result.data.secret);
    setStatus({
      configured: true,
      rotatedAt: result.data.rotatedAt,
      lastUsedAt: null,
    });
    setMessage("New campaign secret generated. Copy it now; AdBridge will not show it again after you leave this page.");
    setBusy(false);
  }

  if (loading) {
    return <main className="formPage"><div className="formCard"><h1>Loading conversion setup…</h1></div></main>;
  }

  return (
    <main className="formPage">
      <Link href="/advertiser/campaigns" className="back">← Your Campaigns</Link>
      <div className="formCard wide">
        <span className="eyebrow">CPA / CPI · CONVERSION TRACKING</span>
        <h1>Secure your <em>postback.</em></h1>
        {campaign && <p>{campaign.name} · {String(campaign.payment_method || "").toUpperCase()}</p>}
        <p>Give your server a campaign-specific credential so accepted installs or actions can be attributed to the correct AdBridge tracking link.</p>

        {error && <div className="successBox" role="alert">{error}</div>}
        {message && <div className="successBox" role="status" aria-live="polite">{message}</div>}

        {status && (
          <section className="quick">
            <h2>Credential status</h2>
            <p><strong>{status.configured ? "Campaign-specific secret active" : "Campaign-specific secret not configured"}</strong></p>
            {!status.configured && <p className="fieldHint">During rollout, an existing shared CPA_POSTBACK_SECRET may still be accepted. Generate a campaign secret to isolate this campaign; once generated, the shared fallback is ignored for it.</p>}
            {status.rotatedAt && <small>Last rotated: {new Date(status.rotatedAt).toLocaleString()}</small>}
            {status.lastUsedAt && <small>Last used: {new Date(status.lastUsedAt).toLocaleString()}</small>}
            <button className="primary" type="button" disabled={busy} onClick={() => void rotate()}>
              {busy ? "Generating…" : status.configured ? "Rotate campaign secret" : "Generate campaign secret"}
            </button>
          </section>
        )}

        {secret && (
          <section className="quick">
            <h2>Copy your new secret now</h2>
            <p>This plaintext is shown only in this page session. It is stored as a SHA-256 hash and cannot be retrieved later. Rotating again invalidates this value.</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 10, background: "rgba(120,130,150,.12)" }}>{secret}</pre>
            <button className="primary" type="button" onClick={() => void copy(secret, "Campaign secret")}>Copy secret</button>
          </section>
        )}

        <section className="quick">
          <h2>Postback endpoint</h2>
          <p>Send the request from your server after your system has confirmed the install, purchase or other action. Never place the secret in browser code.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 10, background: "rgba(120,130,150,.12)" }}>{endpoint || "Endpoint unavailable until NEXT_PUBLIC_SUPABASE_URL is configured."}</pre>
          <button className="secondary" type="button" disabled={!endpoint} onClick={() => void copy(endpoint, "Postback endpoint")}>Copy endpoint</button>
          <h3>JSON payload</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 10, background: "rgba(120,130,150,.12)" }}>{payload}</pre>
          <button className="secondary" type="button" onClick={() => void copy(payload, "Postback JSON")}>Copy JSON</button>
          <h3>Server request example</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 10, background: "rgba(120,130,150,.12)" }}>{curlExample}</pre>
          <button className="secondary" type="button" disabled={!endpoint} onClick={() => void copy(curlExample, "Request example")}>Copy request example</button>
        </section>

        <section className="quick">
          <h2>Important attribution rules</h2>
          <ul>
            <li>Use the short click_id slug from the creator's AdBridge /go/ tracking link, not the full URL.</li>
            <li>For CPI campaigns, send action_type as install. For CPA, use a meaningful action such as purchase or signup.</li>
            <li>external_conversion_id must be unique within this campaign so retries cannot pay twice.</li>
            <li>Do not send creator_id. AdBridge resolves creator attribution from the saved tracking link and does not return creator identity in the postback response.</li>
            <li>A click alone is not proof of an install or purchase. Only accepted server postbacks count as conversion events.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
