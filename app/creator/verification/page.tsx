"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const platforms = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["facebook", "Facebook"],
  ["x", "X"],
  ["linkedin", "LinkedIn"],
  ["snapchat", "Snapchat"],
  ["other", "Other"],
];

const postTypes = [
  ["text", "Write-up"],
  ["image", "Image post"],
  ["video", "Video"],
  ["story", "Story"],
  ["reel", "Reel"],
  ["short", "Short video"],
];

export default function CreatorVerification() {
  const [platform, setPlatform] = useState("instagram");
  const [postType, setPostType] = useState("text");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const [{ data: profile }, { data: submissions }] = await Promise.all([
      supabase.from("profiles").select("verified").eq("id", user.id).maybeSingle(),
      supabase
        .from("creator_verification_submissions")
        .select("id,platform,post_type,post_url,status,admin_note,created_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    setVerified(Boolean(profile?.verified));
    setRows(submissions || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setError("");
    setMessage("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Please sign in again.");
      setBusy(false);
      return;
    }

    const { error: submitError } = await supabase.rpc("submit_creator_verification", {
      p_platform: platform,
      p_post_type: postType,
      p_post_url: url.trim(),
      p_note: note.trim() || null,
    });

    if (submitError) {
      setError(submitError.message || "Your verification post could not be submitted.");
      setBusy(false);
      return;
    }

    setMessage("Your post link has been received. AdBridge will still check the post itself before verifying your listing.");
    setUrl("");
    setNote("");
    await load();
    setBusy(false);
  }

  return (
    <main className="formPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CREATOR VERIFICATION</span>
        <h1>Verify your <em>creator listing.</em></h1>
        <p>
          Publish an AdBridge promotional write-up, image, story or video on one of your social media pages.
          Then submit the public post link so our team can check that it is live and genuinely promotes AdBridge.
        </p>

        <div className="infoBox">
          <b>What your post must do</b>
          <ul>
            <li>Clearly promote AdBridge as a platform connecting brands, creators and publishers.</li>
            <li>Explain how creators can discover advertising opportunities and earn from approved work.</li>
            <li>Include the AdBridge name and a link to the AdBridge website where possible.</li>
            <li>Keep the post public while it is being reviewed.</li>
          </ul>
          <p>Do not submit an old post, a private link, or content that does not promote AdBridge.</p>
        </div>

        <div className="successBox" role="status">
          {verified
            ? "✓ Your creator listing is verified."
            : "Your listing stays unverified until an administrator approves your promotional post."}
        </div>

        <form onSubmit={submit}>
          <label>Social media platform</label>
          <select className="textInput" value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {platforms.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>

          <label>What did you publish?</label>
          <select className="textInput" value={postType} onChange={(event) => setPostType(event.target.value)}>
            {postTypes.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>

          <label>Public link to your AdBridge promotional post</label>
          <input
            className="textInput"
            type="url"
            required
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
          />

          <label>Extra details (optional)</label>
          <textarea
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything our review team should know?"
          />

          {error && <div className="successBox" role="alert">{error}</div>}
          {message && <div className="successBox" role="status">{message}</div>}

          <button className="primary fullButton" disabled={busy}>
            {busy ? "Submitting…" : "Submit post for verification →"}
          </button>
        </form>

        <h2>Your submissions</h2>
        {rows.length ? rows.map((row) => (
          <article className="infoBox" key={row.id}>
            <b>{String(row.platform).toUpperCase()} · {row.post_type}</b>
            <p>
              <a href={row.post_url} target="_blank" rel="noreferrer">Open submitted post ↗</a>
            </p>
            <strong>{String(row.status).toUpperCase()}</strong>
            {row.admin_note && <p>Admin note: {row.admin_note}</p>}
            <small>{new Date(row.created_at).toLocaleString()}</small>
          </article>
        )) : <p>No verification posts submitted yet.</p>}
      </div>
    </main>
  );
}
