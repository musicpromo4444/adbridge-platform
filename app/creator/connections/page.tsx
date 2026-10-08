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
];

export default function Connections() {
  const [connections, setConnections] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("creator_platform_connections")
      .select("platform,connected,updated_at")
      .eq("creator_id", user.id);

    setConnections(data || []);
  };

  useEffect(() => {
    void load();
  }, []);

  async function connect(platform: string) {
    if (!supabase) {
      setMessage("AdBridge is not configured.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Please sign in first.");
      return;
    }

    setBusy(platform);
    setMessage("");

    const { data, error } = await supabase.functions.invoke("social-oauth-start", {
      body: { platform, creator_id: user.id },
    });

    if (error || !data?.url) {
      setMessage(error?.message || data?.error || "This connection is not configured yet.");
      setBusy("");
      return;
    }

    window.location.href = data.url;
  }

  async function disconnect(platform: string) {
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setBusy(platform);

    await supabase
      .from("creator_platform_connections")
      .update({ connected: false, updated_at: new Date().toISOString() })
      .eq("creator_id", user.id)
      .eq("platform", platform);

    await load();
    setBusy("");
  }

  return (
    <main className="formPage">
      <Link href="/creator/profile" className="back">← Creator Profile</Link>
      <div className="formCard wide">
        <span className="eyebrow">SOCIAL CONNECTIONS</span>
        <h1>Connect your <em>accounts.</em></h1>
        <p>
          Connected accounts let AdBridge verify campaign results directly from supported platforms
          instead of relying on creator-entered numbers.
        </p>

        {message && <div className="successBox">{message}</div>}

        <div className="statsGrid">
          {platforms.map((platform) => {
            const connected = connections.some(
              (item) => item.platform === platform.id && item.connected
            );

            return (
              <div key={platform.id} className="quick">
                <h2>{platform.name}</h2>
                <p>{platform.desc}</p>
                <strong>{connected ? "Connected ✓" : "Not connected"}</strong>
                <br />
                {connected ? (
                  <button
                    className="secondary"
                    disabled={busy === platform.id}
                    onClick={() => void disconnect(platform.id)}
                  >
                    {busy === platform.id ? "Working…" : "Disconnect"}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={busy === platform.id}
                    onClick={() => void connect(platform.id)}
                  >
                    {busy === platform.id ? "Opening…" : "Connect " + platform.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="successBox">
          <b>Privacy:</b> AdBridge only uses connected platform access for the features you authorize.
          Tokens are stored server-side and are not displayed to advertisers.
        </div>
      </div>
    </main>
  );
}
