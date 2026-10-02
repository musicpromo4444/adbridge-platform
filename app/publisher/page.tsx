"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string; goal: string; platform: string | null; status: string };
type Asset = { asset_type: string; asset_url: string | null };

const destinations = [
  { id: "web", title: "Web", icon: "◎", desc: "Universal browser embed or direct ad URL", badge: "HTML / JS" },
  { id: "webapp", title: "Web App", icon: "▣", desc: "Web-app friendly package with responsive delivery", badge: "WEB APP" },
  { id: "android", title: "Android App", icon: "▱", desc: "Android-ready SDK configuration and placement package", badge: "SDK" },
];

function baseUrl() {
  if (typeof window === "undefined") return "https://adbridge-platform.vercel.app";
  return window.location.origin;
}

export default function PublisherCenter() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [destination, setDestination] = useState("web");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.from("campaigns").select("id,name,goal,platform,status").eq("status", "active").order("created_at", { ascending: false });
      const list = data ?? [];
      setCampaigns(list);
      if (list[0]) setCampaignId(list[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!supabase || !campaignId) return;
    (async () => {
      const { data } = await supabase.from("campaign_assets").select("asset_type,asset_url").eq("campaign_id", campaignId);
      setAssets(data ?? []);
    })();
  }, [campaignId]);

  const campaign = campaigns.find(c => c.id === campaignId);
  const asset = assets.find(a => a.asset_url)?.asset_url || "";
  const deliveryUrl = useMemo(() => campaignId ? baseUrl() + "/ad/" + campaignId + "?destination=" + destination : "", [campaignId, destination]);

  const webCode = '<script async src="' + baseUrl() + '/api/adbridge/embed" data-campaign="' + campaignId + '" data-destination="' + destination + '"></script>';
  const androidCode = "AdBridge Android adapter\\nCampaign ID: " + campaignId + "\\nDelivery URL: " + deliveryUrl + "\\nDestination: android\\n\\nUse this generated campaign URL inside your Android app/WebView or connect it to the AdBridge Android SDK adapter when enabled.";

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
    setMessage("Copied. The publisher can paste this directly into the selected destination.");
    setTimeout(() => setMessage(""), 3000);
  }

  function downloadConfig() {
    const body = destination === "android" ? androidCode : webCode;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = destination === "android" ? "adbridge-android-integration.txt" : "adbridge-web-integration.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <main className="formPage publisherPage">
    <div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">PUBLISHER DELIVERY CENTER</span><Link href="/creator" className="switch">Creator Dashboard →</Link></div>
    <div className="formCard wide">
      <span className="eyebrow">ONE-CLICK AD FORMAT DELIVERY</span>
      <h1>Pick the destination.<br/><em>AdBridge prepares the format.</em></h1>
      <p>Publishers should not have to convert an advertiser's creative themselves. Select where the ad will run and AdBridge prepares the delivery package for that destination.</p>

      <label>1. Choose an active advertiser campaign</label>
      <select className="textInput" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
        <option value="">{loading ? "Loading campaigns…" : "Select a campaign"}</option>
        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} · {c.goal}</option>)}
      </select>

      <label>2. Where will you place the ad?</label>
      <div className="destinationGrid">
        {destinations.map(d => <button type="button" key={d.id} className={"destinationCard " + (destination === d.id ? "selected" : "")} onClick={() => setDestination(d.id)}>
          <span className="destinationIcon">{d.icon}</span><strong>{d.title}</strong><small>{d.desc}</small><b>{d.badge}</b>
        </button>)}
      </div>

      <div className="deliveryBox"><div><span className="eyebrow">READY TO TAKE</span><h2>{destination === "android" ? "Android SDK package" : destination === "webapp" ? "Web App package" : "Web package"}</h2><p>{destination === "android" ? "The publisher receives Android-ready integration instructions and a campaign-specific SDK configuration." : "The publisher receives a campaign-specific delivery URL and paste-ready integration code."}</p></div><span className="statusPill">AUTOMATIC</span></div>

      {campaignId && <div className="generatedPanel">
        <div className="generatedHead"><div><span className="eyebrow">GENERATED FOR {campaign?.name || "CAMPAIGN"}</span><h2>{destination.toUpperCase()}</h2></div><span className="formatBadge">{destination === "android" ? "SDK" : "EMBED"}</span></div>
        <label>{destination === "android" ? "SDK configuration" : "Publisher delivery link"}</label>
        <div className="copyRow"><input className="textInput" readOnly value={destination === "android" ? androidCode : deliveryUrl}/><button className="secondary" onClick={() => copy(destination === "android" ? androidCode : deliveryUrl)}>Copy</button></div>
        {destination !== "android" && <><label>One-click embed code</label><textarea readOnly value={webCode}/></>}
        <div className="choiceRow"><button className="primary" onClick={downloadConfig}>Export integration →</button><a className="secondary" href={deliveryUrl} target="_blank" rel="noreferrer">Preview ad ↗</a></div>
      </div>}

      {asset && <div className="successBox">✓ Advertiser creative detected. AdBridge will deliver the linked campaign asset through the selected destination adapter.</div>}
      {message && <div className="successBox">{message}</div>}

      <div className="conversionInfo"><span className="eyebrow">THE ADAPTER LAYER</span><div className="conversionGrid"><div><b>Advertiser input</b><p>Creative + CTA + required action</p></div><div><b>AdBridge engine</b><p>Validates, packages and selects the destination adapter</p></div><div><b>Publisher output</b><p>Web, Web App or Android-ready delivery</p></div></div></div>
    </div>
  </main>;
}
