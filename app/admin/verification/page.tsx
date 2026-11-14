"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ReviewStatus = "approved" | "rejected";

export default function AdminCreatorVerification() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      setError("Administrator access required.");
      return;
    }

    const { data, error: loadError } = await supabase
      .from("creator_verification_submissions")
      .select("id,creator_id,platform,post_type,post_url,note,status,created_at")
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message);
    setRows(data || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(row: any, status: ReviewStatus) {
    if (!supabase) return;

    setBusy(row.id);
    setError("");
    setMessage("");

    const adminNote = note[row.id]?.trim() || null;
    const { error: reviewError } = await supabase.rpc("review_creator_verification", {
      p_submission_id: row.id,
      p_status: status,
      p_admin_note: adminNote,
    });

    if (reviewError) {
      setError(reviewError.message || "The verification decision could not be saved.");
      setBusy("");
      return;
    }

    setMessage(status === "approved"
      ? "Creator verified and notified."
      : "Verification rejected and creator notified.");

    await load();
    setBusy("");
  }

  return (
    <main className="formPage">
      <Link href="/admin" className="back">← Admin Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">ADMIN · CREATOR VERIFICATION</span>
        <h1>Review creator <em>promotions.</em></h1>
        <p>
          Open each public AdBridge promotional post and confirm it is live, relevant and genuinely promotes
          the platform before approving the creator listing.
        </p>

        {error && <div className="successBox" role="alert">{error}</div>}
        {message && <div className="successBox" role="status">{message}</div>}

        {rows.map((row) => (
          <article className="infoBox" key={row.id}>
            <b>{String(row.status).toUpperCase()} · {row.platform} · {row.post_type}</b>
            <h3>Creator ID: {row.creator_id}</h3>
            <p>{row.note || "No extra details."}</p>
            <a className="secondary" href={row.post_url} target="_blank" rel="noreferrer">
              Open public post ↗
            </a>

            {row.status === "pending" && (
              <>
                <label>Review note (optional)</label>
                <textarea
                  value={note[row.id] || ""}
                  maxLength={500}
                  onChange={(event) => setNote((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="Explain why this post is rejected, if applicable."
                />
                <div className="choiceRow">
                  <button
                    className="primary"
                    disabled={Boolean(busy)}
                    onClick={() => void decide(row, "approved")}
                  >
                    {busy === row.id ? "Saving…" : "Approve & verify creator"}
                  </button>
                  <button
                    className="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void decide(row, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
          </article>
        ))}

        {!rows.length && <div className="successBox">No verification submissions yet.</div>}
      </div>
    </main>
  );
}
