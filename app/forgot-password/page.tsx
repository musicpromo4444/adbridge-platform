"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError("Database connection is not configured."); return; }
    setBusy(true); setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (resetError) setError("We could not send a reset email. Check the address and try again.");
    else setSent(true);
    setBusy(false);
  }

  return (
    <main className="formPage">
      <div className="formCard">
        <span className="eyebrow">ADBRIDGE ACCOUNT RECOVERY</span>
        <h1>Reset your <em>password.</em></h1>
        {sent ? (
          <div className="successBox" role="status">If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.</div>
        ) : (
          <form onSubmit={submit}>
            <p>Enter the email address on your AdBridge account. We will send a secure reset link.</p>
            <label htmlFor="recovery-email">Email</label>
            <input id="recovery-email" className="textInput" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
            {error && <div className="successBox" role="alert">{error}</div>}
            <button className="primary fullButton" disabled={busy}>{busy ? "Sending…" : "Send reset link →"}</button>
          </form>
        )}
        <p><Link href="/login">← Back to sign in</Link></p>
      </div>
    </main>
  );
}
