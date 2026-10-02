"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Platform = {
  id: string;
  name: string;
  format: string;
  ratio: string;
  automaticPlacement: string;
  automaticTiming: string;
  safeArea: string;
  disclosure: string;
};

const platforms: Platform[] = [
  {
    id: "tiktok", name: "TikTok", format: "Vertical video", ratio: "9:16",
    automaticPlacement: "AI chooses the clearest lower/side area after detecting the creator, captions and interface-sensitive areas.",
    automaticTiming: "AI selects the least disruptive moments instead of using one fixed timestamp.",
    safeArea: "Avoids detected TikTok interface areas and important creator content.",
    disclosure: "AdBridge prepares the creator for TikTok's required commercial-content disclosure."
  },
  {
    id: "youtube", name: "YouTube", format: "YouTube video", ratio: "16:9 / source",
    automaticPlacement: "AI chooses a natural in-video product placement or eligible static card location based on the content.",
    automaticTiming: "AI selects an appropriate moment from the actual video; it does not assume a universal 10–15 second rule.",
    safeArea: "Avoids faces, important text and key visual information.",
    disclosure: "AdBridge prepares the creator for YouTube's paid-promotion declaration."
  },
  {
    id: "shorts", name: "YouTube Shorts", format: "Short video", ratio: "9:16",
    automaticPlacement: "AI chooses clear space while keeping the creator and important content visible.",
    automaticTiming: "AI chooses timing from the actual video rather than a fixed timestamp.",
    safeArea: "Preserves important creator content and avoids interface-sensitive areas.",
    disclosure: "AdBridge prepares the creator for YouTube's paid-promotion declaration."
  },
  {
    id: "facebook", name: "Facebook Feed", format: "Feed video/image", ratio: "Source-aware",
    automaticPlacement: "AI finds clear space without covering faces, important text or the main subject.",
    automaticTiming: "AI chooses timing based on movement and scene changes when the format supports an in-video placement.",
    safeArea: "Protects detected important content and interface-sensitive areas.",
    disclosure: "AdBridge prepares the creator for applicable branded-content disclosure."
  },
  {
    id: "facebook-reels", name: "Facebook Reels", format: "Vertical Reel", ratio: "9:16",
    automaticPlacement: "AI chooses the clearest area while protecting the creator and key content.",
    automaticTiming: "AI chooses the least disruptive moment from the actual video.",
    safeArea: "Protects important content and interface-sensitive areas.",
    disclosure: "AdBridge prepares the creator for applicable branded-content disclosure."
  },
  {
    id: "instagram", name: "Instagram Reels", format: "Vertical Reel", ratio: "9:16",
    automaticPlacement: "AI finds clear space around faces, captions and the main subject.",
    automaticTiming: "AI chooses the least disruptive moment from the actual video.",
    safeArea: "Protects faces, captions, important visual information and interface-sensitive areas.",
    disclosure: "AdBridge prepares the creator for applicable paid-partnership disclosure."
  }
];

const placements = [
  {id:"card", name:"Product card", description:"A compact product panel placed automatically in clear space."},
  {id:"floating", name:"Floating product", description:"The product follows a safe area while the scene moves."},
  {id:"logo", name:"Logo + CTA", description:"A compact brand mark and call-to-action placed automatically."},
  {id:"natural", name:"Natural placement", description:"The AI places the product into a suitable part of the scene."}
];

export default function Studio() {
  const [platform, setPlatform] = useState("tiktok");
  const [placement, setPlacement] = useState("floating");
  const [videoUrl, setVideoUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);
  const [campaigns, setCampaigns] = useState<{id:string;name:string;platform:string|null}[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("campaign");
    (async () => {
      if (!supabase) return;
      const ids = JSON.parse(localStorage.getItem("adbridge-jobs") || "[]");
      let query = supabase.from("creator_campaigns").select("campaign_id,campaigns(id,name,platform)").eq("status", "accepted");
      if (ids.length) query = query.in("id", ids);
      const { data } = await query;
      const list = (data ?? []).map((row:any) => row.campaigns).filter(Boolean);
      setCampaigns(list);
      setCampaignId(requested && list.some(x => x.id === requested) ? requested : (list[0]?.id || ""));
    })();
  }, []);

  const selectedCampaign = campaigns.find(c => c.id === campaignId);

  const selected = useMemo(
    () => platforms.find(item => item.id === platform) ?? platforms[0],
    [platform]
  );

  function choosePlatform(id: string) {
    setPlatform(id);
    setDone(false);
  }

  function chooseVideo(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setVideoUrl(URL.createObjectURL(file));
    setDone(false);
  }

  function analyze() {
    setAnalyzing(true);
    setDone(false);
    window.setTimeout(() => {
      setAnalyzing(false);
      setDone(true);
    }, 1300);
  }

  return <main className="formPage studioPage">
    <Link href="/creator" className="back">← Creator Dashboard</Link>

    <div className="formCard wide studioCard">
      <span className="eyebrow">ADBRIDGE AI STUDIO</span>
      <h1>Choose where you're posting. <em>AI does the rest.</em></h1>
      <p>
        You don't need to learn platform rules. Pick the destination and AdBridge automatically
        analyzes your content, finds safe space, chooses timing and prepares the advertiser placement for that platform.
      </p>

      <div className="studioSteps">
        <div className="active"><b>01</b><span>Choose platform</span></div>
        <div><b>02</b><span>AI analyzes</span></div>
        <div><b>03</b><span>AI places ad</span></div>
        <div><b>04</b><span>Final check</span></div>
      </div>

      <label>Where are you posting?</label>
      <div className="platformGrid">
        {platforms.map(item =>
          <button
            key={item.id}
            className={platform === item.id ? "platformButton selected" : "platformButton"}
            onClick={() => choosePlatform(item.id)}
            type="button"
          >
            <strong>{item.name}</strong>
            <small>{item.format} · {item.ratio}</small>
          </button>
        )}
      </div>

      <div className="autoBanner">
        <div className="autoIcon">✦</div>
        <div>
          <strong>{selected.name} selected — automatic mode</strong>
          <small>AdBridge will apply the destination's current rules automatically. You don't need to read them.</small>
        </div>
      </div>

      <div className="studioWorkspace">
        <section className="studioPanel">
          <label>Your content</label>
          <input type="file" accept="video/*,image/*" onChange={event => chooseVideo(event.target.files?.[0])}/>
          {fileName && <div className="filePicked">✓ {fileName}</div>}

          <label>Campaign</label>
          <select value={campaignId} onChange={event => setCampaignId(event.target.value)}>
            <option value="">Choose an accepted campaign</option>
            {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.platform ? " · " + item.platform : ""}</option>)}
          </select>

          <label>Advertiser placement</label>
          <div className="placementChoices">
            {placements.map(item =>
              <button
                type="button"
                key={item.id}
                className={placement === item.id ? "placementChoice selected" : "placementChoice"}
                onClick={() => setPlacement(item.id)}
              >
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </button>
            )}
          </div>

          <button className="primary fullButton" onClick={analyze} disabled={analyzing}>
            {analyzing ? "AI is analyzing your video…" : "Let AI place the ad →"}
          </button>
        </section>

        <section className="studioPanel previewPanel">
          <div className="previewHeader">
            <div><span className="eyebrow">AI PREVIEW</span><h2>{selected.name}</h2></div>
            <span className="formatBadge">{selected.ratio}</span>
          </div>

          <div className={"aiPreview " + (selected.ratio === "16:9 / source" ? "widePreview" : "")}>
            {videoUrl
              ? <video src={videoUrl} controls muted playsInline/>
              : <div className="previewPlaceholder"><span>▶</span><b>Upload your content</b><small>AI will choose the placement automatically.</small></div>
            }

            {done && <>
              <div className="safeZone safeOne">SAFE AREA</div>
              <div className="safeZone safeTwo">SAFE AREA</div>
              <div className="blockedZone">KEEP CLEAR</div>
              <div className="placementMock">
                <span>AD</span>
                <b>{placement === "natural" ? "Product placed naturally" : "Advertiser product"}</b>
                <small>AI selected this position</small>
              </div>
            </>}
          </div>

          {done && <div className="analysisResult">
            <div className="resultTitle"><span>✓</span><strong>Placement selected automatically</strong></div>
            <p>{selected.automaticPlacement}</p>
            <div className="checkList">
              <div><span>✓</span> Destination format: {selected.ratio}</div>
              <div><span>✓</span> Safe area detected</div>
              <div><span>✓</span> Timing selected from your actual video</div>
              <div><span>✓</span> Platform requirements checked</div>
            </div>
          </div>}
        </section>
      </div>

      <div className="automaticResult">
        <div className="complianceTop">
          <div><span className="eyebrow">WHAT AI DECIDED</span><h2>{selected.name}</h2></div>
          <span className="statusPill">AUTOMATIC</span>
        </div>

        <div className="complianceGrid">
          <div><b>📍 Where</b><p>{selected.automaticPlacement}</p></div>
          <div><b>⏱ When</b><p>{selected.automaticTiming}</p></div>
          <div><b>🛡 Protected</b><p>{selected.safeArea}</p></div>
          <div><b>✓ Posting</b><p>{selected.disclosure}</p></div>
        </div>
      </div>

      {saveMessage && <div className="successBox">{saveMessage}</div>}

      {done && <div className="finalCheck">
        <div>
          <span className="eyebrow">FINAL CHECK</span>
          <h2>Everything is ready for your review</h2>
          <p>AdBridge checks the destination before export. The creator reviews the final result and remains in control of posting.</p>
        </div>
        <button className="secondary" type="button" onClick={() => setSaveMessage("Preview approved. Submit the finished post from your campaign workspace.")}>Approve & export →</button>
      </div>}
    </div>
  </main>
}
