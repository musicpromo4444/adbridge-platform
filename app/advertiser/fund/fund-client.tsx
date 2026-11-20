"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const assetMap: Record<string, string> = {
  "Product photos/video": "product_media",
  "Product or sample": "sample",
  "Logo + brand assets": "brand_assets",
  "Website/app link": "website_app_link"
};
const platformNames: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook",
  x: "X", snapchat: "Snapchat", linkedin: "LinkedIn", website: "Website",
  web_app: "Web App", android_app: "Android App", ios_app: "iOS App"
};
const formatNames: Record<string, string> = {
  web: "Web", web_app: "Web App", android_app: "Android App", ios_app: "iOS App",
  social_post: "Social Post", social_story: "Social Story", social_reel: "Social Reel",
  social_video: "Social Video", web_banner: "Web Banner", web_native: "Web Native",
  web_interstitial: "Web Interstitial", web_video: "Web Video", app_banner: "App Banner",
  app_native: "App Native", app_interstitial: "App Interstitial", app_video: "App Video",
  app_rewarded_video: "Rewarded Video"
};
const paymentNames: Record<string, string> = {
  cpm: "CPM · Pay per 1,000 views", cpc: "CPC · Pay per click",
  cpi: "CPI · Pay per install", cpa: "CPA · Pay per completed action",
  link_traffic: "Link traffic", product_placement: "Product placement",
  brand_mention: "Brand mention", partnership: "Partnership", job: "Creator post / job"
};

export default function Fund() {
  const p = useSearchParams();
  const verifyMode = p.get("verify") === "1";
  const campaignIdFromUrl = p.get("campaign") || "";
  const reference = p.get("reference") || p.get("trxref") || "";
  const verificationStarted = useRef(false);
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [verificationAmount, setVerificationAmount] = useState<number | null>(null);

  const goal = p.get("goal") || "video";
  const platforms = p.get("platforms") || "tiktok";
  const method = p.get("method") || "job";
  const formats = p.get("formats") || "web";
  const name = p.get("name") || "Untitled campaign";
  const instructions = p.get("instructions") || "";
  const assets = p.get("assets") || "";
  const destination = p.get("destination") || "";
  const assetPaths = p.get("assetPaths") || "";
  const rate = p.get("rate") || "0";
  const budget = p.get("budget") || "0";
  const results = p.get("results") || "0";

  const selectedPlatforms = platforms.split(",").map(x => x.trim()).filter(x => platformNames[x]);
  const selectedFormats = formats.split(",").map(x => x.trim()).filter(x => formatNames[x]);
  const selectedAssets = assets.split(",").map(x => x.trim()).filter(x => assetMap[x]);
  const numericRate = Number(rate);
  const numericBudget = Number(budget);
  const numericResults = Number(results.replaceAll(",", ""));

  useEffect(() => {
    if (!verifyMode || verificationStarted.current) return;
    verificationStarted.current = true;

    async function verify() {
      if (!campaignIdFromUrl || !reference) {
        setError("The Paystack return link is missing its campaign or transaction reference. Check billing history before attempting another payment.");
        setVerifying(false);
        return;
      }
      if (!supabase) {
        setError("AdBridge could not connect to its payment verification service.");
        setVerifying(false);
        return;
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError("Sign in to the advertiser account that started this payment, then reopen this verification link.");
        setVerifying(false);
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke("verify-campaign-payment", {
        body: { campaign_id: campaignIdFromUrl, reference }
      });
      if (invokeError || data?.error || data?.success !== true) {
        setError(data?.error || invokeError?.message || "Paystack has not confirmed this payment. Your campaign remains unfunded.");
        setVerifying(false);
        return;
      }
      setVerificationAmount(typeof data.amount === "number" ? data.amount : null);
      setVerified(true);
      setVerifying(false);
    }
    void verify();
  }, [verifyMode, campaignIdFromUrl, reference]);

  async function createCampaign() {
    if (!supabase) { setError("Database connection is not ready."); return; }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { window.location.href = "/login"; return; }
    if (!name.trim() || !instructions.trim()) { setError("Campaign name and clear partner instructions are required."); return; }
    if (!selectedPlatforms.length || !selectedFormats.length) { setError("Choose at least one supported platform and delivery format."); return; }
    if (!Number.isFinite(numericRate) || numericRate <= 0) { setError("Enter a payment rate or agreed fee greater than zero."); return; }
    if (!Number.isFinite(numericBudget) || numericBudget <= 0) { setError("Enter a maximum campaign budget greater than zero."); return; }
    if (!Number.isFinite(numericResults) || numericResults <= 0) { setError("Enter a target result greater than zero."); return; }
    if (numericBudget < numericRate && method !== "cpm") { setError("The maximum budget should be at least as large as the agreed rate or fee."); return; }
    if (["cpc", "link_traffic", "cpi", "cpa"].includes(method)) {
      try {
        const url = new URL(destination);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
      } catch {
        setError("Add a valid https:// or http:// destination URL for this payment model.");
        return;
      }
    }

    const uploadedPaths = assetPaths.split(",").map(path => path.trim()).filter(Boolean);
    if (uploadedPaths.length > 5 || uploadedPaths.some(path =>
      !path.startsWith(user.id + "/") || path.includes("..") || path.startsWith("/")
    )) {
      setError("One or more uploaded files are invalid or do not belong to your account. Return to campaign details and upload them again.");
      return;
    }

    const uploadedUrls = uploadedPaths.map(path =>
      supabase.storage.from("campaign-assets").getPublicUrl(path).data.publicUrl
    );
    setSaving(true);
    setError("");
    const { data, error: createError } = await supabase.rpc("create_advertiser_campaign", {
      p_name: name.trim(),
      p_goal: goal,
      p_instructions: instructions.trim(),
      p_platforms: selectedPlatforms,
      p_formats: selectedFormats,
      p_payment_method: method,
      p_payment_rate: numericRate,
      p_max_budget: numericBudget,
      p_desired_results: Math.floor(numericResults),
      p_destination_url: destination.trim() || null,
      p_asset_types: selectedAssets.map(asset => assetMap[asset]),
      p_asset_urls: uploadedUrls
    });
    if (createError || !data?.campaign_id) {
      setError(createError?.message || "We couldn't create the campaign. Please check the details and try again.");
      setSaving(false);
      return;
    }
    setCampaignId(data.campaign_id);
    setSaved(true);
    setSaving(false);
  }

  async function pay() {
    if (!supabase || !campaignId) return;
    setPaying(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("start-campaign-payment", {
      body: { campaign_id: campaignId }
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Payment could not be started.");
      setPaying(false);
      return;
    }
    if (data?.authorization_url) {
      window.location.href = data.authorization_url;
      return;
    }
    setError("The payment provider did not return a secure checkout URL.");
    setPaying(false);
  }

  if (verifyMode) {
    return (
      <main className="formPage">
        <div className="formCard wide">
          <span className="eyebrow">CAMPAIGN PAYMENT · STEP 5 OF 5</span>
          {verifying && <><h1>Verifying your <em>payment.</em></h1><div className="successBox" role="status">Confirming the transaction directly with Paystack. Please keep this page open.</div><p>AdBridge does not mark a campaign funded from a browser redirect alone.</p></>}
          {!verifying && verified && <><h1>Campaign <em>funded.</em></h1><div className="successBox" role="status"><b>Payment confirmed</b><p>Paystack has confirmed your transaction and AdBridge has recorded the funding.</p>{verificationAmount !== null && <p>Confirmed amount: ₦{verificationAmount.toLocaleString("en-NG")}</p>}</div><p>Your campaign is saved and will follow AdBridge's activation and review process before delivery begins.</p><div className="choiceRow"><Link className="primary" href={"/advertiser/results?campaign=" + encodeURIComponent(campaignIdFromUrl)}>View campaign →</Link><Link className="secondary" href="/advertiser">Advertiser dashboard</Link></div></>}
          {!verifying && !verified && <><h1>Payment <em>not confirmed yet.</em></h1><div className="successBox" role="alert">{error}</div><p>If money was deducted, do not pay again immediately. Check your billing history or contact support with your Paystack reference.</p><div className="choiceRow"><Link className="primary" href="/advertiser/billing">Check billing history →</Link><Link className="secondary" href="/advertiser">Back to dashboard</Link></div></>}
        </div>
      </main>
    );
  }

  const platformLabels = selectedPlatforms.map(x => platformNames[x]).join(" · ");
  const formatLabels = selectedFormats.map(x => formatNames[x]).join(" · ");

  return (
    <main className="formPage">
      <Link href={"/advertiser/new/payment?goal=" + encodeURIComponent(goal) + "&platforms=" + encodeURIComponent(platforms)} className="back">← Payment settings</Link>
      <div className="formCard wide">
        <span className="eyebrow">STEP 4 OF 5</span>
        <h1>Review and <em>fund your campaign.</em></h1>
        <p>Check the complete brief and commercial terms before creating your draft. Nothing is published and no money is collected until you complete secure checkout.</p>
        <div className="summary">
          <b>{name}</b>
          <span>Campaign objective: {goal.replaceAll("_", " ")}</span>
          <span>Partner instructions: {instructions || "Not provided"}</span>
          <span>Target platforms: {platformLabels || "None selected"}</span>
          <span>Delivery formats: {formatLabels || "None selected"}</span>
          <span>Brand resources: {selectedAssets.join(" · ") || "No additional resources selected"}</span>
          <span>Uploaded files: {assetPaths.split(",").filter(Boolean).length}</span>
          <span>Payment model: {paymentNames[method] || method}</span>
          <span>Rate / fee: ₦{numericRate.toLocaleString("en-NG")}</span>
          <span>Maximum campaign budget: ₦{numericBudget.toLocaleString("en-NG")}</span>
          <span>Target results: {numericResults.toLocaleString("en-NG")}</span>
          {destination && <span>Destination: {destination}</span>}
        </div>
        <div className="infoBox"><b>Real payment only</b><p>Entering a budget never counts as funding. A campaign is marked funded only after AdBridge independently verifies a successful Paystack transaction and the exact campaign payment record.</p></div>
        {error && <div className="successBox" role="alert">{error}</div>}
        {!saved ? <button className="primary fullButton" disabled={saving} onClick={createCampaign}>{saving ? "Saving campaign draft…" : "Save campaign draft →"}</button> : <>
          <div className="successBox"><b>Draft saved.</b><br />Your campaign has been created but is not funded or live yet.</div>
          <button className="primary fullButton" disabled={paying} onClick={pay}>{paying ? "Opening secure Paystack checkout…" : "Pay securely with Paystack →"}</button>
          <Link className="secondary fullButton" href="/advertiser">Keep as draft</Link>
        </>}
      </div>
    </main>
  );
}
