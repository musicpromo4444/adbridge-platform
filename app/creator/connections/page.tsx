"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const platforms = [
  { id: "tiktok", name: "TikTok", desc: "Connect your TikTok account so AdBridge can verify campaign video metrics." },
  { id: "youtube", name: "YouTube", desc: "Connect your channel for verified video view tracking." },
  { id: "instagram", name: "Instagram", desc: "Connect a professional Instagram account for eligible insights." },
  { id: "facebook", name: "Facebook", desc: "Connect your Page/creator account for eligible video insights." },
  { id: "x", name: "X", desc: "Connect X to verify eligible post view counts." },
  { id: "snapchat", name: "Snapchat", desc: "Connect your Public Profile for eligible Spotlight/Story insights." },
] as const;

type PlatformId = (typeof platforms)[number]["id"];
type PlatformConnection = {
  platform: string;
  connected: boolean;
  expires_at: string | null;
  updated_at: string;
};

const allowedOAuthHosts = new Set([
  "www.tiktok.com",
  "accounts.google.com",
  "www.facebook.com",
  "x.com",
  "accounts.snapchat.com",
]);

export default function Connections() {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      setConnections([]);
      setLoadError("AdBridge database connection is not available.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("creator_platform_connections")
      .select("platform,connected,expires_at,updated_at")
      .eq("creator_id", user.id);

    if (error) {
      setConnections([]);
      setLoadError("Connection status could not be loaded. Refresh and try again.");
    } else {
      setConnections((data ?? []) as PlatformConnection[]);
      setLoadError("");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect(platform: PlatformId) {
    if (!supabase) {
      setMessage("AdBridge is not configured.");
      return;
    }

    setBusy(platform);
    setMessage("");

    const { data, error } = await supabase.functions.invoke("social-oauth-start", {
      body: { platform },
    });

    if (error || typeof data?.url !== "string") {
      setMessage(error?.message || data?.error || "This connection is not configured yet.");
      setBusy("");
      return;
    }

    let target: URL;
    try {
      target = new URL(data.url);
    } catch {
      setMessage("The platform returned an invalid authorization link.");
      setBusy("");
      return;
    }

    if (target.protocol !== "https:" || !allowedOAuthHosts.has(target.hostname)) {
      setMessage("The authorization link was not an approved platform URL.");
      setBusy("");
      return;
    }

    window.location.href = target.toString();
  }

  async function disconnect(platform: PlatformId) {
    if (!supabase) {
      setMessage("AdBridge database connection is not available.");
      return;
    }

    setBusy(platform);
    setMessage("");

    const { data, error } = await supabase.rpc("disconnect_creator_platform", {
      p_platform: platform,
    });

    const result =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;

    if (
      error ||
      !result ||
      result.success !== true ||
      result.platform !== platform ||
      typeof result.disconnected !== "boolean"
    ) {
      setMessage("AdBridge could not confirm the disconnect. No success was recorded.");
      setBusy("");
      await load();
      return;
    }

    setMessage(
      result.disconnected
        ? platform + " was disconnected from AdBridge. To revoke the external platform grant too, remove AdBridge in that platform's app settings."
        : platform + " was already disconnected.",
    );
    setBusy("");
    await load();
  }

  return (
    <main className="formPage">
      <Link href="/creator/profile" className="back">← Creator Profile</Link>
      <div className="formCard wide">
        <span className="eyebrow">SOCIAL CONNECTIONS</span>
        <h1>Connect your <em>accounts.</em></h1>
        <p>
          Connected accounts let AdBridge verify eligible campaign results directly from supported
          platforms instead of relying on creator-entered numbers.
        </p>

        {loadError && <div className="successBox" role="alert">{loadError}</div>}
        {message && <div className="successBox" role="status" aria-live="polite">{message}</div>}
        {loading && <div className="successBox">Loading your connection status…</div>}

        <div className="statsGrid">
          {platforms.map((platform) => {
            const connection = connections.find((item) => item.platform === platform.id);
            const expired = Boolean(
              connection?.connected &&
              connection.expires_at &&
              new Date(connection.expires_at).getTime() <= Date.now(),
            );
            const connected = Boolean(connection?.connected && !expired);

            return (
              <div key={platform.id} className="quick">
                <h2>{platform.name}</h2>
                <p>{platform.desc}</p>
                <strong>
                  {expired ? "Reconnect required" : connected ? "Connected ✓" : "Not connected"}
                </strong>
                {connection?.updated_at && (
                  <p>Last updated {new Date(connection.updated_at).toLocaleString()}</p>
                )}
                <br />
                {connected ? (
                  <button
                    className="secondary"
                    disabled={busy === platform.id || loading}
                    onClick={() => void disconnect(platform.id)}
                  >
                    {busy === platform.id ? "Working…" : "Disconnect"}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={busy === platform.id || loading}
                    onClick={() => void connect(platform.id)}
                  >
                    {busy === platform.id ? "Opening…" : (expired ? "Reconnect " : "Connect ") + platform.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="successBox">
          <b>Privacy:</b> Platform tokens and account IDs are kept in AdBridge's server-side credential
          store and are not readable by browser clients or advertisers. Disconnect clears AdBridge's
          stored credentials; it does not revoke the permission inside the external platform.
        </div>
      </div>
    </main>
  );
}
