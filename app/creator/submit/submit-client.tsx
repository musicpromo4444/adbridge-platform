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

export default function Submit() {
  const p = useSearchParams();
  const job = p.get("job") || "";
  const [posted, setPosted] = useState("");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [trackingError, setTrackingError] = useState("");

  async function submit() {
    if (!supabase || !job) {
      setError("Open this page from an accepted campaign.");
      return;
    }

    let publicUrl: URL;
    try {
      publicUrl = new URL(posted.trim());
      if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error("Invalid protocol");
    } catch {
      setError("Enter a valid public post URL.");
      return;
    }

    if (!hosts[platform]?.some((host) => publicUrl.hostname === host || publicUrl.hostname.endsWith("." + host))) {
      setError("That link does not match the selected platform.");
      return;
    }

    setSaving(true);
    setError("");
    setTrackingError("");
    setTrackingUrl("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Please sign in again.");
      setSaving(false);
      return;
    }

    const { data: jobRecord, error: jobError } = await supabase
      .from("creator_campaigns")
      .select("id,campaign_id,creator_id,status")
      .eq("id", job)
      .eq("creator_id", user.id)
      .single();

    if (jobError || !jobRecord) {
      setError("Campaign job not found.");
      setSaving(false);
      return;
    }
    if (["submitted", "approved", "completed"].includes(jobRecord.status)) {
      setError("This campaign has already been submitted.");
      setSaving(false);
      return;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("payment_method,desired_results,platform,status")
      .eq("id", jobRecord.campaign_id)
      .single();

    if (campaignError || !campaign) {
      setError("Campaign details could not be loaded.");
      setSaving(false);
      return;
    }
    if (!["active", "funded"].includes(String(campaign.status))) {
      setError("This campaign is not accepting submissions yet.");
      setSaving(false);
      return;
    }

    const paymentMethod = String(campaign.payment_method || "").toLowerCase();
    setMethod(paymentMethod);
    const targetMetric = ["cpm", "views"].includes(paymentMethod)
      ? Number(campaign.desired_results || 0)
      : null;
    const special = specialModels.includes(paymentMethod);
    const finalNote = special
      ? [note.trim(), evidence.trim() ? "Proof/evidence: " + evidence.trim() : ""].filter(Boolean).join("\n")
      : note.trim();

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        campaign_id: jobRecord.campaign_id,
        creator_id: user.id,
        creator_campaign_id: jobRecord.id,
        posted_url: posted.trim(),
        note: finalNote,
        status: "waiting",
        tracking_platform: platform.toLowerCase(),
        target_metric: targetMetric,
        current_metric: 0,
        metric_status: targetMetric ? "pending" : "not_required",
      })
      .select("id")
      .single();

    if (submissionError || !submission) {
      setError(submissionError?.message || "Submission failed.");
      setSaving(false);
      return;
    }

    if (trackedModels.includes(paymentMethod)) {
      const { data: destination, error: destinationError } = await supabase
        .from("campaign_destination_urls")
        .select("target_url")
        .eq("campaign_id", jobRecord.campaign_id)
        .maybeSingle();

      if (destinationError || !destination?.target_url) {
        setTrackingError("Your submission was saved, but AdBridge could not load the advertiser's destination URL. Contact AdBridge before promoting this campaign.");
      } else {
        const slug = "c_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
        const { error: linkError } = await supabase.from("tracking_links").insert({
          campaign_id: jobRecord.campaign_id,
          creator_id: user.id,
          submission_id: submission.id,
          slug,
          target_url: destination.target_url,
        });
        if (linkError) {
          setTrackingError("Your submission was saved, but the tracked link could not be created. Do not promote an untracked destination URL.");
        } else {
          setTrackingUrl(window.location.origin + "/go/" + slug);
        }
      }
    }

    const { error: statusError } = await supabase.rpc("mark_creator_campaign_submitted", { p_job_id: job });
    if (statusError) {
      setError(statusError.message || "The submission was saved but the campaign status could not be updated.");
      setSaving(false);
      return;
    }

    setSent(true);
    setSaving(false);
  }

  const special = specialModels.includes(method);

  return (
    <main className="formPage">
      <Link href="/creator/work" className="back">← My Work</Link>
      <div className="formCard">
        <span className="eyebrow">SEND COMPLETED WORK</span>
        <h1>Ready to <em>submit?</em></h1>
        <p>Submit the public link. AdBridge verifies results where the configured platform integration supports it.</p>
        <label>Platform</label>
        <select className="textInput" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          {Object.keys(hosts).map((name) => <option key={name}>{name}</option>)}
        </select>
        <label>Published work link</label>
        <input className="textInput" value={posted} onChange={(event) => setPosted(event.target.value)} placeholder="https://tiktok.com/..." />
        {platform === "Snapchat" && (
          <>
            <label>Evidence / Insights link</label>
            <input className="textInput" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Paste eligible Insights evidence link" />
          </>
        )}
        {special && (
          <>
            <label>Proof / evidence</label>
            <input className="textInput" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Optional screenshot, transcript or proof link" />
          </>
        )}
        <label>{special ? "Add a note for AdBridge review" : "Anything AdBridge should know?"}</label>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" />
        {error && <div className="successBox" role="alert">{error}</div>}
        <button className="primary" disabled={saving || sent} onClick={submit}>
          {saving ? "Sending…" : sent ? "Sent for approval ✓" : "Send for approval →"}
        </button>
        {sent && (
          <>
            <div className="successBox">
              <b>Submission received.</b><br />
              {trackingUrl && (
                <>
                  Your unique campaign link: <a href={trackingUrl} target="_blank" rel="noreferrer">{trackingUrl}</a><br />
                  Use this link wherever you promote the campaign.
                </>
              )}
              {trackingError && <p role="alert">{trackingError}</p>}
              {special
                ? "AdBridge will review your post and proof before payment is released."
                : "AdBridge will record tracked results according to the campaign model."}
            </div>
            <Link className="secondary" href="/creator/work">Back to my work →</Link>
          </>
        )}
      </div>
    </main>
  );
}
