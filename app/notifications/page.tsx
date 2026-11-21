"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { completionReasonLabel } from "@/lib/campaign-lifecycle";

type Notification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  link: string | null;
  is_read: boolean;
  completion_reason: string | null;
  created_at: string;
};

export default function Notifications() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setRows([]);
      setError("AdBridge database is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }
    const { data, error: queryError } = await supabase
      .from("notifications")
      .select("id,title,body,kind,link,is_read,completion_reason,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (queryError) {
      setRows([]);
      setError("Notifications could not be loaded. Please refresh and try again.");
    } else {
      setRows((data || []) as Notification[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (updateError) {
      setError("This notification could not be marked as read.");
    } else {
      setRows(current => current.map(row => row.id === id ? { ...row, is_read: true } : row));
    }
    setBusy(false);
  }

  async function markAll() {
    if (!supabase) return;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (updateError) {
      setError("Notifications could not be marked as read.");
    } else {
      setRows(current => current.map(row => ({ ...row, is_read: true })));
    }
    setBusy(false);
  }

  const unread = rows.filter(row => !row.is_read).length;

  return (
    <main className="formPage">
      <Link href="/" className="back">← AdBridge</Link>
      <div className="formCard wide">
        <span className="eyebrow">YOUR UPDATES</span>
        <h1>Notifications <em>({unread})</em></h1>
        <p>Important updates about your account, campaigns, verification, submissions and payments.</p>
        <div className="choiceRow">
          <button className="secondary" onClick={() => void markAll()} disabled={!unread || busy}>Mark all as read</button>
          <button className="secondary" onClick={() => void load()} disabled={busy}>Refresh</button>
        </div>
        {error && <div className="successBox" role="alert">{error}</div>}
        {loading ? (
          <div className="successBox">Loading notifications…</div>
        ) : rows.length ? (
          <div className="opps">
            {rows.map(row => (
              <article key={row.id} style={{ opacity: row.is_read ? 0.72 : 1 }}>
                <div className="choiceRow">
                  <b>{row.title}</b>
                  <small>{row.is_read ? "Read" : "Unread"}</small>
                </div>
                <p>{row.body}</p>
                {row.kind === "campaign_completed" && row.completion_reason && (
                  <small>{completionReasonLabel(row.completion_reason)}</small>
                )}
                <small>{new Date(row.created_at).toLocaleString()}</small>
                <div className="choiceRow">
                  {!row.is_read && (
                    <button className="secondary" disabled={busy} onClick={() => void markRead(row.id)}>Mark as read</button>
                  )}
                  {row.link && <Link className="secondary" href={row.link}>Open →</Link>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="successBox">You're all caught up. New account and campaign updates will appear here.</div>
        )}
      </div>
    </main>
  );
}
