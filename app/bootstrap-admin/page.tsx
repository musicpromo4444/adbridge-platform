"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function BootstrapAdmin() {
  const [secret, setSecret] = useState("");
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!supabase) {
        if (active) setError("AdBridge database is not configured.");
        if (active) setChecking(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) window.location.replace("/login?next=%2Fbootstrap-admin");
      else setSignedIn(true);
      setChecking(false);
    }
    void check();
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !secret.trim()) return;
    setBusy(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("admin-bootstrap", {
      body: {},
      headers: { "x-adbridge-bootstrap-secret": secret.trim() },
    });
    setBusy(false);
    if (invokeError || !data?.ok) {
      setError(data?.error || invokeError?.message || "Administrator setup could not be completed.");
      return;
    }
    setSecret("");
    setSuccess(true);
    window.setTimeout(() => { window.location.assign("/admin"); }, 900);
  }

  return (
    <main className="formPage">
      <div className="formCard">
        <span className="eyebrow">ADBRIDGE · INITIAL OWNER SETUP</span>
        <h1>Secure the <em>admin account.</em></h1>
        <p>This one-time process is available only while the project has no administrator. Sign in with your confirmed owner account and use the bootstrap credential configured in Supabase Edge Function Secrets.</p>
        {checking && <div className="successBox">Checking your account…</div>}
        {!checking && signedIn && !success && (
          <form onSubmit={submit}>
            <label htmlFor="bootstrap-secret">One-time bootstrap credential</label>
            <input id="bootstrap-secret" className="textInput" type="password" autoComplete="off" required value={secret} onChange={event => setSecret(event.target.value)} />
            {error && <div className="successBox" role="alert">{error}</div>}
            <button className="primary fullButton" disabled={busy || !secret.trim()}>{busy ? "Securing administrator…" : "Create first administrator →"}</button>
          </form>
        )}
        {success && <div className="successBox" role="status">Administrator access created. Redirecting to the secure admin workspace…</div>}
        <p><Link href="/login">← Sign in</Link></p>
      </div>
    </main>
  );
}
