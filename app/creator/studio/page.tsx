"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CampaignAsset = { id: string; asset_type: string; asset_url: string | null };
type PlacementResult = { placement: { x:number; y:number; width:number; height:number; start_seconds:number; end_seconds:number; confidence:number; anchor:string } | null; reasoning:string; confidence:number; safe_areas:any[]; blocked_areas:any[]; warnings:string[] };

async function captureFrames(file:File) {
  const url=URL.createObjectURL(file), video=document.createElement("video"); video.preload="auto"; video.muted=true; video.playsInline=true; video.src=url;
  try { await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error("Could not read the video file."));});
    const duration=Number(video.duration),width=video.videoWidth,height=video.videoHeight;
    if(!Number.isFinite(duration)||duration<1||duration>600)throw new Error("Video must be between 1 second and 10 minutes.");
    if(!width||!height||width>7680||height>7680)throw new Error("Unsupported video dimensions.");
    const times=[0.05,0.25,0.5,0.75,0.95].map(x=>Math.min(duration-0.02,Math.max(0,duration*x)));const canvas=document.createElement("canvas");const scale=Math.min(1,640/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Frame capture unavailable.");const frames=[];
    for(const t of times){await new Promise<void>((resolve,reject)=>{video.onseeked=()=>resolve();video.onerror=()=>reject(new Error("Video frame could not be read."));video.currentTime=t;});ctx.drawImage(video,0,0,canvas.width,canvas.height);const image=canvas.toDataURL("image/jpeg",0.65);frames.push({timestamp_seconds:Number(t.toFixed(2)),image_data_url:image});}
    if(frames.some(f=>f.image_data_url.length>1100000)||frames.reduce((sum,f)=>sum+f.image_data_url.length,0)>4800000)throw new Error("Video frames are too large. Try a lower-resolution video.");return {duration,width,height,frames};
  } finally { video.removeAttribute("src");video.load();URL.revokeObjectURL(url); }
}

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
    id: "x", name: "X", format: "Post video", ratio: "Source-aware",
    automaticPlacement: "Keeps the brand placement clear without covering the main subject or important text.",
    automaticTiming: "Uses the actual video structure rather than a fixed timestamp.",
    safeArea: "Protects captions, faces and key visual information.",
    disclosure: "Prepares the creator for applicable paid-content disclosure."
  },
  {
    id: "snapchat", name: "Snapchat", format: "Vertical video", ratio: "9:16",
    automaticPlacement: "Keeps the placement inside clear visual space while protecting the main content.",
    automaticTiming: "Selects timing from the actual video when the format supports it.",
    safeArea: "Protects faces, captions and interface-sensitive areas.",
    disclosure: "Prepares the creator for applicable commercial-content disclosure."
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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [campaignAssets, setCampaignAssets] = useState<CampaignAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [analysis, setAnalysis] = useState<PlacementResult | null>(null);
  const [modelName, setModelName] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
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
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) { window.location.href="/login"; return; }
      const query = supabase.from("creator_campaigns").select("campaign_id,campaigns(id,name,platform)").eq("status", "accepted").eq("creator_id", user.id);
      const { data } = await query;
      const list = (data ?? []).map((row:any) => row.campaigns).filter(Boolean);
      setCampaigns(list);
      setCampaignId(requested && list.some(x => x.id === requested) ? requested : (list[0]?.id || ""));
    })();
  }, []);

  const selectedCampaign = campaigns.find(c => c.id === campaignId);

  const selectedCampaignAsset = campaignAssets.find(a => a.id === assetId);
  const activePlacement = analysis?.placement && currentTime >= analysis.placement.start_seconds && currentTime <= analysis.placement.end_seconds;

  useEffect(() => {
    let live=true; async function loadAssets(){setCampaignAssets([]);setAssetId("");setAnalysis(null);if(!supabase||!campaignId)return;const {data,error:e}=await supabase.from("campaign_assets").select("id,asset_type,asset_url").eq("campaign_id",campaignId).order("created_at",{ascending:true});if(!live)return;if(e){setAnalysisError("Campaign logo assets could not be loaded.");return;}const images=(data||[]).filter(a=>a.asset_url&&/\.(png|jpe?g|webp)(\?|$)/i.test(a.asset_url));setCampaignAssets(images as CampaignAsset[]);setAssetId(images[0]?.id||"");}
    void loadAssets();return()=>{live=false};
  },[campaignId]);

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
          <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => chooseVideo(event.target.files?.[0])}/>
          {fileName && <div className="filePicked">✓ {fileName}</div>}

          <label>Accepted campaign</label>
          <select value={campaignId} onChange={event => setCampaignId(event.target.value)}>
            <option value="">Choose an accepted campaign</option>
            {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.platform ? " · " + item.platform : ""}</option>)}
          </select>

          <label>Campaign logo / brand image</label>\n          <select value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">Choose image asset</option>{campaignAssets.map(a=><option key={a.id} value={a.id}>{a.asset_type.replaceAll("_"," ")}</option>)}</select>\n          {campaignId&&!campaignAssets.length&&<div className="successBox">This campaign has no image logo assets. Ask the advertiser to upload a PNG, JPG or WebP image.</div>}\n          <label>Advertiser placement</label>
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

          <button className="primary fullButton" onClick={()=>void analyze()} disabled={analyzing||!videoFile||!campaignId||!assetId}>
            {analyzing ? "Analyzing video frames…" : "Analyze actual video & placement →"}
          </button>
        </section>

        <section className="studioPanel previewPanel">
          <div className="previewHeader">
            <div><span className="eyebrow">PLACEMENT PREVIEW</span><h2>{selected.name}</h2></div>
            <span className="formatBadge">{selected.ratio}</span>
          </div>

          <div className={"aiPreview " + (selected.ratio === "16:9 / source" ? "widePreview" : "")}>
            {videoUrl
              ? <video src={videoUrl} controls muted playsInline onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)}/>
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
