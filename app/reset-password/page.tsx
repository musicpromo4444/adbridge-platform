"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    async function checkSession() {
      if (!supabase) { setError("Database connection is not configured."); return; }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!alive) return;
      if (sessionError || !data.session) setError("This reset link is invalid or has expired. Request a new one.");
      else setReady(true);
    }
    void checkSession();
    return () => { alive = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true); setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError("Password update failed. The reset link may have expired.");
    else { setSaved(true); await supabase.auth.signOut(); }
    setBusy(false);
  }

  return (
    <main className="formPage">
      <div className="formCard">
        <span className="eyebrow">ADBRIDGE ACCOUNT RECOVERY</span>
        <h1>Choose a new <em>password.</em></h1>
        {saved ? (
          <div className="successBox" role="status">Your password has been updated. Sign in with your new password.</div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" className="textInput" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} disabled={!ready || busy} />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" className="textInput" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={!ready || busy} />
            {error && <div className="successBox" role="alert">{error}</div>}
            <button className="primary fullButton" disabled={!ready || busy}>{busy ? "Updating…" : "Update password →"}</button>
          </form>
        )}
        <p><Link href="/login">Go to sign in →</Link></p>
        {!ready && !saved && !error && <p>Checking your reset link…</p>}
      </div>
    </main>
  );
}
