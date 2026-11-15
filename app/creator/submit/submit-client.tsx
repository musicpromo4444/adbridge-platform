"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const hosts: Record<string, string[]> = {
  TikTok: ["tiktok.com"],
  "Instagram Reels": ["instagram.com"],
  Instagram: ["instagram.com"],
  YouTube: ["youtube.com", "youtu.be"],
  "YouTube Shorts": ["youtube.com", "youtu.be"],
  Facebook: ["facebook.com"],
  "Facebook Reels": ["facebook.com"],
  X: ["x.com", "twitter.com"],
  Snapchat: ["snapchat.com"],
};

const trackedModels = ["cpc", "clicks", "link_traffic", "cpi", "cpa", "actions"];
const specialModels = ["product_placement", "brand_mention", "partnership", "job", "placement"];

type SubmissionResult = {
  success?: boolean;
  submission_id?: string;
  status?: string;
  payment_method?: string | null;
  tracking_slug?: string | null;
};

function submissionErrorMessage(code?: string) {
  if (code === "28000") return "Please sign in again before submitting your work.";
  if (code === "42501") return "Only a creator account can submit campaign work.";
  if (code === "P0002") return "This campaign job is no longer available.";
  if (code === "P0001") return "This campaign or job cannot accept another submission right now.";
  if (code === "22023") return "Check that the published post URL and platform are valid.";
  return "AdBridge could not save your submission. Please try again.";
}

export default function Submit() {
  const params = useSearchParams();
  const job = params.get("job") || "";
  const [posted, setPosted] = useState("");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  async function submit() {
    if (!supabase || !job) {
      setError("Open this page from an accepted campaign.");
      return;
    }

    let publicUrl: URL;
    try {
      publicUrl = new URL(posted.trim());
      if (
        !["http:", "https:"].includes(publicUrl.protocol)
        || !publicUrl.hostname
        || publicUrl.username
        || publicUrl.password
      ) {
        throw new Error("Invalid public URL");
      }
    } catch {
      setError("Enter a valid public post URL.");
      return;
    }

    if (!hosts[platform]?.some((host) =>
      publicUrl.hostname === host || publicUrl.hostname.endsWith("." + host)
    )) {
      setError("That link does not match the selected platform.");
      return;
    }

    const finalNote = [
      note.trim(),
      evidence.trim() ? "Proof/evidence: " + evidence.trim() : "",
    ].filter(Boolean).join("\n");

    if (finalNote.length > 2000) {
      setError("Your note and evidence must be 2,000 characters or fewer.");
      return;
    }

    setSaving(true);
    setError("");
    setTrackingUrl("");

    const { data, error: submissionError } = await supabase.rpc(
      "submit_creator_campaign_work",
      {
        p_job_id: job,
        p_posted_url: posted.trim(),
        p_platform: platform,
        p_note: finalNote || null,
      },
    );

    if (submissionError) {
      setError(submissionErrorMessage(submissionError.code));
      setSaving(false);
      return;
    }

    const result = data as SubmissionResult | null;
    if (!result?.success || !result.submission_id) {
      setError("AdBridge did not confirm that your submission was saved. Please try again.");
      setSaving(false);
      return;
    }

    const paymentMethod = String(result.payment_method || "").toLowerCase();
    setMethod(paymentMethod);

    if (trackedModels.includes(paymentMethod)) {
      if (!result.tracking_slug) {
        setError("Your submission was saved, but its tracking link was not returned. Do not promote it until AdBridge confirms the link.");
        setSaving(false);
        return;
      }
      setTrackingUrl(window.location.origin + "/go/" + result.tracking_slug);
    }

    setSent(true);
    setSaving(false);
  }

  const special = specialModels.includes(method);
  const tracked = trackedModels.includes(method);

  return (
    <main className="formPage">
      <Link href="/creator/work" className="back">← My Work</Link>
      <div className="formCard">
        <span className="eyebrow">SEND COMPLETED WORK</span>
        <h1>Ready to <em>submit?</em></h1>
        <p>Submit the public link. AdBridge records results only through the tracking or platform integrations configured for the campaign.</p>

        <label>Platform</label>
        <select className="textInput" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          {Object.keys(hosts).map((name) => <option key={name}>{name}</option>)}
        </select>

        <label>Published work link</label>
        <input
          className="textInput"
          value={posted}
          onChange={(event) => setPosted(event.target.value)}
          placeholder="https://tiktok.com/..."
          maxLength={2048}
        />

        {platform === "Snapchat" && (
          <>
            <label>Evidence / Insights link</label>
            <input
              className="textInput"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="Paste eligible Insights evidence link"
              maxLength={1500}
            />
          </>
        )}

        {special && (
          <>
            <label>Proof / evidence</label>
            <input
              className="textInput"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="Optional screenshot, transcript or proof link"
              maxLength={1500}
            />
          </>
        )}

        <label>{special ? "Add a note for AdBridge review" : "Anything AdBridge should know?"}</label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note"
          maxLength={2000}
        />

        {error && <div className="successBox" role="alert">{error}</div>}

        <button className="primary" disabled={saving || sent} onClick={submit}>
          {saving ? "Sending…" : sent ? "Sent for approval ✓" : "Send for approval →"}
        </button>

        {sent && (
          <>
            <div className="successBox">
              <b>Submission received.</b>
              {trackingUrl && (
                <>
                  <br />
                  Your unique campaign link:{" "}
                  <a href={trackingUrl} target="_blank" rel="noreferrer">{trackingUrl}</a>
                  <br />
                  Use this AdBridge link wherever you promote the campaign.
                </>
              )}
              <p>
                {tracked
                  ? "AdBridge records eligible clicks. CPI/CPA actions are counted only when a valid postback is attributed to this link; a click alone is not proof of an install or purchase."
                  : special
                    ? "AdBridge will review your post and the evidence you supplied before approval."
                    : "AdBridge will process the submission using the campaign's configured review and measurement rules."}
              </p>
            </div>
            <Link className="secondary" href="/creator/work">Back to my work →</Link>
          </>
        )}
      </div>
    </main>
  );
}
