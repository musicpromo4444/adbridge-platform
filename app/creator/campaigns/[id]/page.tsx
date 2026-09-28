"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  instructions: string | null;
  platform: string | null;
  payment_method: string | null;
  payment_rate: number | null;
  max_budget: number | null;
};

type Asset = { asset_type: string; asset_url: string };

export default function CampaignDetails({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"locked" | "understand" | "test" | "unlocked">("locked");
  const [error, setError] = useState("");

  const storageKey = "adbridge-unlocked-" + params.id;

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "yes") setPhase("unlocked");

    async function load() {
      if (!supabase) {
        setError("AdBridge database is not connected yet.");
        setLoading(false);
        return;
      }
      const [{ data, error: campaignError }, { data: assetData }] = await Promise.all([
        supabase.from("campaigns").select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget").eq("id", params.id).single(),
        supabase.from("campaign_assets").select("asset_type,asset_url").eq("campaign_id", params.id)
      ]);
      if (campaignError || !data) setError("This campaign could not be found.");
      else {
        setCampaign(data);
        setAssets(assetData ?? []);
      }
      setLoading(false);
    }
    load();
  }, [params.id, storageKey]);

  if (loading) return <main className="formPage"><div className="formCard"><span className="eyebrow">CAMPAIGN</span><h1>Loading...</h1></div></main>;
  if (error || !campaign) return <main className="formPage"><Link href="/creator/campaigns" className="back">← Campaigns</Link><div className="formCard"><div className="successBox">{error || "Campaign unavailable."}</div></div></main>;

  const isInstall = /install|download|app/i.test(campaign.goal + " " + (campaign.instructions ?? ""));
  const actionAsset = assets.find(a => a.asset_type === "website_app_link") || assets.find(a => a.asset_url);

  function unlock() {
    localStorage.setItem(storageKey, "yes");
    setPhase("unlocked");
  }

  return <main className="formPage">
    <Link href="/creator/campaigns" className="back">← Campaigns</Link>
    <div className="formCard wide">
      <span className="eyebrow">CAMPAIGN DETAILS</span>
      <div className="lockHero">
        <div className="lockIcon">{phase === "unlocked" ? "🔓" : "🔒"}</div>
        <div>
          <h1>{campaign.name}</h1>
          <p>{phase === "unlocked" ? "Campaign unlocked. You can now participate." : "Complete the short campaign test before you can participate."}</p>
        </div>
      </div>

      <div className="detailGrid">
        <section>
          <h2>What the advertiser wants</h2>
          <p><strong>Goal:</strong> {campaign.goal}</p>
          <p>{campaign.instructions || "Follow the advertiser's campaign instructions carefully."}</p>
          {campaign.platform && <p><strong>Platform:</strong> {campaign.platform}</p>}
        </section>
        <aside>
          <span className="eyebrow">PAYMENT</span>
          <h2>₦{Number(campaign.payment_rate ?? 0).toLocaleString()}</h2>
          <p>Payment is released after your completed work is approved.</p>
        </aside>
      </div>

      {phase === "locked" && <div className="unlockBox">
        <div className="lockIcon">🔒</div>
        <h2>Before you participate</h2>
        <p>We want to make sure you understand exactly what the advertiser is asking you to do.</p>
        <button className="primary" onClick={() => setPhase("understand")}>See how to participate →</button>
      </div>}

      {phase === "understand" && <div className="unlockBox">
        <span className="eyebrow">STEP 1</span>
        <h2>Do you understand this campaign?</h2>
        <p>{campaign.instructions || "Read the campaign instructions above. You will need to follow them exactly when creating your content."}</p>
        <div className="choiceRow">
          <button className="primary" onClick={() => setPhase("test")}>Yes, I understand →</button>
          <button className="secondary" onClick={() => setPhase("locked")}>No, show me again</button>
        </div>
      </div>}

      {phase === "test" && <div className="unlockBox">
        <span className="eyebrow">STEP 2 · CAMPAIGN TEST</span>
        <h2>{isInstall ? "Prove you understand the app-install campaign" : "Complete this short campaign test"}</h2>
        <p>{isInstall
          ? "The advertiser wants viewers to download the app through the campaign link. Open the link below and complete the download/test action."
          : "Open the campaign resource below, review it, then confirm that you understand what a viewer must do."}</p>
        {actionAsset?.asset_url ? (
          <a className="secondary" href={actionAsset.asset_url} target="_blank" rel="noreferrer">
            {isInstall ? "Open app download link ↗" : "Open campaign resource ↗"}
          </a>
        ) : (
          <div className="successBox">No test link was supplied. Read the instructions carefully, then continue.</div>
        )}
        <button className="primary" onClick={unlock}>
          {isInstall ? "I completed the download →" : "I completed the test →"}
        </button>
        <small>For live app-install verification, AdBridge can later connect this step to an app-install tracking provider.</small>
      </div>}

      {phase === "unlocked" && <div className="unlockBox">
        <div className="successBox">✓ You completed the campaign test.</div>
        <h2>Campaign unlocked</h2>
        <p>You have shown that you understand what the advertiser wants. You can now participate.</p>
        <Link className="primary" href={"/creator/work?campaign=" + campaign.id}>Accept & start campaign →</Link>
      </div>}
    </div>
  </main>;
}
