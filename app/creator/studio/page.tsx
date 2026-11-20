"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string; platform: string | null };
type CampaignAsset = { id: string; asset_type: string; asset_url: string };
type PlacementRect = { x: number; y: number; width: number; height: number; label?: string; kind?: "safe" | "blocked" };
type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  anchor: string;
};
type PlacementResult = {
  placement: Placement | null;
  reasoning: string;
  confidence: number;
  safe_areas: PlacementRect[];
  blocked_areas: PlacementRect[];
  warnings: string[];
  logo_url: string;
};
type PlacementJob = {
  id: string;
  status: string;
  platform: string;
  placement_type: string;
  created_at: string;
  result: PlacementResult | null;
};

const platforms = [
  { id: "tiktok", name: "TikTok", format: "Vertical video", ratio: "9:16", note: "Keep clear of captions and on-screen controls." },
  { id: "youtube", name: "YouTube", format: "YouTube video", ratio: "Source ratio", note: "Protect the subject, subtitles and key scene details." },
  { id: "shorts", name: "YouTube Shorts", format: "Short video", ratio: "9:16", note: "Keep clear of the Shorts interface and captions." },
  { id: "facebook", name: "Facebook Feed", format: "Feed video", ratio: "Source ratio", note: "Protect the main subject and feed controls." },
  { id: "facebook-reels", name: "Facebook Reels", format: "Vertical Reel", ratio: "9:16", note: "Avoid Reels controls and important visual content." },
  { id: "x", name: "X", format: "Post video", ratio: "Source ratio", note: "Keep the logo away from subtitles and the main subject." },
  { id: "snapchat", name: "Snapchat", format: "Vertical video", ratio: "9:16", note: "Protect the creator and interface-sensitive edges." },
  { id: "instagram", name: "Instagram Reels", format: "Vertical Reel", ratio: "9:16", note: "Avoid captions, faces and Reels controls." },
];

const placements = [
  { id: "logo", name: "Logo", description: "Place the advertiser's brand image in one clear area." },
  { id: "floating", name: "Floating logo", description: "Choose a clear position that remains visible across sampled frames." },
  { id: "card", name: "Brand card", description: "Reserve a compact rectangle for the campaign brand asset." },
  { id: "natural", name: "Natural placement", description: "Find a visually quiet area that fits the scene." },
];

function isImageAsset(url: string) {
  try {
    return /\.(png|jpe?g|webp)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function fileLabel(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "Campaign image");
  } catch {
    return "Campaign image";
  }
}

async function captureVideoFrames(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("The selected video could not be decoded in this browser.")), { once: true });
      video.load();
    });

    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
      throw new Error("Choose a video between 1 second and 10 minutes long.");
    }
    if (!width || !height) throw new Error("The video dimensions could not be read.");

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare video frames.");

    const samplePoints = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9];
    const frames: { timestamp_seconds: number; image_data_url: string }[] = [];

    for (const point of samplePoints) {
      const timestamp = Number((duration * point).toFixed(2));
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => resolve();
        const onError = () => reject(new Error("A video frame could not be read."));
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = timestamp;
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        timestamp_seconds: timestamp,
        image_data_url: canvas.toDataURL("image/jpeg", 0.68),
      });
    }

    return {
      duration_seconds: Number(duration.toFixed(2)),
      frame_width: width,
      frame_height: height,
      frames,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function Studio() {
  const [platform, setPlatform] = useState("tiktok");
  const [placementType, setPlacementType] = useState("logo");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [history, setHistory] = useState<PlacementJob[]>([]);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [jobId, setJobId] = useState("");
  const [model, setModel] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    let live = true;
    async function loadCampaigns() {
      if (!supabase) {
        setError("AdBridge database is not connected.");
        setLoadingCampaigns(false);
        return;
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }
      const { data, error: campaignError } = await supabase
        .from("creator_campaigns")
        .select("campaign_id,campaigns(id,name,platform)")
        .eq("creator_id", user.id)
        .eq("status", "accepted");
      if (!live) return;
      if (campaignError) {
        setError("Accepted campaigns could not be loaded. Please refresh.");
        setLoadingCampaigns(false);
        return;
      }
      const list = (data || []).map((row: any) => row.campaigns).filter(Boolean) as Campaign[];
      setCampaigns(list);
      const requested = new URLSearchParams(window.location.search).get("campaign");
      setCampaignId(requested && list.some(item => item.id === requested) ? requested : (list[0]?.id || ""));
      setLoadingCampaigns(false);
    }
    void loadCampaigns();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    async function loadCampaignResources() {
      if (!supabase || !campaignId) {
        setAssets([]);
        setAssetId("");
        setHistory([]);
        return;
      }
      setLoadingAssets(true);
      const [assetResponse, historyResponse] = await Promise.all([
        supabase.from("campaign_assets")
          .select("id,asset_type,asset_url")
          .eq("campaign_id", campaignId)
          .not("asset_url", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("creator_placement_jobs")
          .select("id,status,platform,placement_type,created_at,result")
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (!live) return;
      if (assetResponse.error) {
        setError("Campaign brand assets could not be loaded. Check that the campaign is active.");
        setAssets([]);
      } else {
        const images = ((assetResponse.data || []) as CampaignAsset[]).filter(asset => !!asset.asset_url && isImageAsset(asset.asset_url));
        setAssets(images);
        setAssetId(images[0]?.id || "");
      }
      if (historyResponse.error) {
        setHistory([]);
        setHistoryNotice("Placement history becomes available after the placement migration is deployed.");
      } else {
        setHistory((historyResponse.data || []) as PlacementJob[]);
        setHistoryNotice("");
      }
      setLoadingAssets(false);
    }
    void loadCampaignResources();
    return () => { live = false; };
  }, [campaignId]);

  function chooseVideo(file?: File) {
    if (!file) return;
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setError("Choose an MP4 or WebM video.");
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      setError("The selected video must be 250 MB or smaller.");
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setCurrentTime(0);
    setResult(null);
    setJobId("");
    setError("");
  }

  async function analyze() {
    if (!supabase || !campaignId || !assetId || !videoFile) {
      setError("Choose an accepted campaign, a campaign logo/image and a video before analysis.");
      return;
    }
    setAnalyzing(true);
    setError("");
    setResult(null);
    setJobId("");

    try {
      const video = await captureVideoFrames(videoFile);
      const { data, error: invokeError } = await supabase.functions.invoke("analyze-creator-placement", {
        body: {
          request_id: crypto.randomUUID(),
          campaign_id: campaignId,
          campaign_asset_id: assetId,
          platform,
          placement_type: placementType,
          ...video,
        },
      });

      if (invokeError || data?.error) {
        const code = data?.error || invokeError?.message || "placement_analysis_failed";
        if (String(code).includes("ai_provider_not_configured")) {
          throw new Error("AI placement is not configured yet. Add AI_API_KEY to Supabase Edge Function Secrets before using this tool.");
        }
        if (String(code).includes("placement_rate_limited")) {
          throw new Error("You have reached the five-analysis hourly limit. Try again later.");
        }
        if (String(code).includes("campaign_brand_asset")) {
          throw new Error("The selected campaign image is unavailable. Choose another uploaded brand image.");
        }
        throw new Error("AI placement analysis failed. " + String(code));
      }
      if (data?.status !== "succeeded" || !data?.job_id || !data?.result) {
        throw new Error("AdBridge did not receive a completed placement result. No preview was generated.");
      }

      setResult(data.result as PlacementResult);
      setJobId(data.job_id as string);
      setModel(String(data.model || ""));
      const { data: savedJobs } = await supabase
        .from("creator_placement_jobs")
        .select("id,status,platform,placement_type,created_at,result")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(5);
      setHistory((savedJobs || []) as PlacementJob[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI placement analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function previewPlacement() {
    const placement = result?.placement;
    const video = videoRef.current;
    if (!placement || !video) return;
    video.currentTime = placement.start_seconds;
    try {
      await video.play();
    } catch {
      setError("Press play on the video to preview the suggested placement.");
    }
  }

  function downloadPlan() {
    if (!result || !jobId) return;
    const payload = {
      adbridge_job_id: jobId,
      campaign_id: campaignId,
      platform,
      placement_type: placementType,
      model,
      generated_at: new Date().toISOString(),
      result,
      note: "Placement instructions only. This file is not a rendered or exported video.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "adbridge-placement-" + jobId + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activePlacement = result?.placement &&
    currentTime >= result.placement.start_seconds &&
    currentTime <= result.placement.end_seconds;
  const selectedAsset = assets.find(asset => asset.id === assetId);

  return (
    <main className="formPage studioPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>

      <div className="formCard wide studioCard">
        <span className="eyebrow">ADBRIDGE AI STUDIO</span>
        <h1>Place the brand. <em>Keep the story clear.</em></h1>
        <p>Choose an accepted campaign, select the advertiser's uploaded brand image and analyze your actual video. AdBridge sends sampled frames to the configured AI provider and saves a measured placement suggestion.</p>

        <div className="studioSteps">
          <div className="active"><b>01</b><span>Choose campaign</span></div>
          <div><b>02</b><span>Analyze frames</span></div>
          <div><b>03</b><span>Review placement</span></div>
          <div><b>04</b><span>Download instructions</span></div>
        </div>

        <div className="studioWorkspace">
          <section className="studioPanel">
            <label htmlFor="studio-campaign">Accepted campaign</label>
            <select id="studio-campaign" value={campaignId} onChange={event => setCampaignId(event.target.value)} disabled={loadingCampaigns}>
              <option value="">{loadingCampaigns ? "Loading campaigns…" : "Choose an accepted campaign"}</option>
              {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.platform ? " · " + item.platform : ""}</option>)}
            </select>

            <label htmlFor="studio-asset">Advertiser logo / brand image</label>
            <select id="studio-asset" value={assetId} onChange={event => setAssetId(event.target.value)} disabled={loadingAssets || !assets.length}>
              <option value="">{loadingAssets ? "Loading campaign images…" : assets.length ? "Choose a brand image" : "No campaign image available"}</option>
              {assets.map(asset => <option key={asset.id} value={asset.id}>{fileLabel(asset.asset_url)} · {asset.asset_type.replaceAll("_", " ")}</option>)}
            </select>
            {selectedAsset && <div className="studioLogoChoice"><img src={selectedAsset.asset_url} alt="Selected campaign brand asset"/><span>Selected campaign asset</span></div>}
            {!loadingAssets && campaignId && !assets.length && <div className="studioNotice">This campaign has no uploaded image asset. The advertiser must add a logo or brand image before AI placement can run.</div>}

            <label htmlFor="studio-platform">Posting platform</label>
            <select id="studio-platform" value={platform} onChange={event => setPlatform(event.target.value)}>
              {platforms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.ratio}</option>)}
            </select>
            <p className="fieldHint">{platforms.find(item => item.id === platform)?.note}</p>

            <label>Placement style</label>
            <div className="placementChoices">
              {placements.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={placementType === item.id ? "placementChoice selected" : "placementChoice"}
                  onClick={() => setPlacementType(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>

            <label htmlFor="studio-video">Your video</label>
            <input id="studio-video" type="file" accept="video/mp4,video/webm" onChange={event => chooseVideo(event.target.files?.[0])}/>
            {videoFile && <div className="filePicked">✓ {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB</div>}

            <div className="studioPrivacyNote">
              Your original video stays in this browser. Six resized frames and the selected campaign image are sent to the configured AI provider. AdBridge stores the placement result, not the video or sampled frames.
            </div>

            <button className="primary fullButton" type="button" onClick={analyze} disabled={analyzing || loadingCampaigns || loadingAssets || !campaignId || !assetId || !videoFile}>
              {analyzing ? "Analyzing real video frames…" : "Analyze video with AI →"}
            </button>
          </section>

          <section className="studioPanel previewPanel">
            <div className="previewHeader">
              <div><span className="eyebrow">VIDEO PLACEMENT</span><h2>{platforms.find(item => item.id === platform)?.name}</h2></div>
              <span className="formatBadge">{platforms.find(item => item.id === platform)?.ratio}</span>
            </div>

            <div className="aiPreview">
              {videoUrl ? (
                <div className="studioVideoStage">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    muted
                    playsInline
                    onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
                  />
                  {result?.safe_areas.map((area, index) => (
                    <div key={"safe-" + index} className="studioRegion safe" style={{ left: (area.x * 100) + "%", top: (area.y * 100) + "%", width: (area.width * 100) + "%", height: (area.height * 100) + "%" }}>
                      {area.label || "AI safe area"}
                    </div>
                  ))}
                  {result?.blocked_areas.map((area, index) => (
                    <div key={"blocked-" + index} className="studioRegion blocked" style={{ left: (area.x * 100) + "%", top: (area.y * 100) + "%", width: (area.width * 100) + "%", height: (area.height * 100) + "%" }}>
                      {area.label || "Keep clear"}
                    </div>
                  ))}
                  {activePlacement && result?.logo_url && result.placement && (
                    <img
                      className="studioLogoOverlay"
                      src={result.logo_url}
                      alt="AI suggested advertiser logo placement"
                      style={{
                        left: (result.placement.x * 100) + "%",
                        top: (result.placement.y * 100) + "%",
                        width: (result.placement.width * 100) + "%",
                        height: (result.placement.height * 100) + "%",
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="previewPlaceholder"><span>▶</span><b>Choose a video</b><small>The preview uses your actual uploaded file in this browser.</small></div>
              )}
            </div>

            {result && (
              <div className="analysisResult">
                <div className="resultTitle"><span>✓</span><strong>AI analysis saved · {jobId.slice(0, 8)}</strong></div>
                <p>{result.reasoning}</p>
                {result.placement ? (
                  <>
                    <div className="studioMetricRow">
                      <span>AI confidence estimate <b>{Math.round(result.placement.confidence * 100)}%</b></span>
                      <span>Time window <b>{result.placement.start_seconds.toFixed(2)}s–{result.placement.end_seconds.toFixed(2)}s</b></span>
                    </div>
                    <div className="choiceRow">
                      <button type="button" className="primary" onClick={previewPlacement}>Preview placement →</button>
                      <button type="button" className="secondary" onClick={downloadPlan}>Download placement instructions</button>
                    </div>
                  </>
                ) : (
                  <div className="studioNotice">The AI did not find a safe placement in the sampled frames. No logo overlay was created. Try another video segment.</div>
                )}
                {result.warnings.length > 0 && <ul className="studioWarnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                <small className="studioModelLabel">{model ? "Model: " + model : ""} · This is a placement suggestion, not a rendered video or platform-policy certification.</small>
              </div>
            )}
          </section>
        </div>

        {error && <div className="successBox" role="alert">{error}</div>}

        <div className="automaticResult">
          <div className="complianceTop">
            <div><span className="eyebrow">REVIEW BEFORE POSTING</span><h2>Creator remains in control</h2></div>
            <span className="statusPill">SUGGESTION ONLY</span>
          </div>
          <div className="complianceGrid">
            <div><b>Visual evidence</b><p>The model reviews sampled frames, not every frame of the original video.</p></div>
            <div><b>Placement geometry</b><p>Coordinates are normalized to the source frame and validated before saving.</p></div>
            <div><b>Platform controls</b><p>Check current platform UI, captions and disclosure requirements before publishing.</p></div>
            <div><b>Export</b><p>AdBridge downloads placement instructions. It does not render or modify the source video in this workflow.</p></div>
          </div>
        </div>

        <div className="quick studioHistory">
          <h2>Recent placement analyses</h2>
          {historyNotice && <p>{historyNotice}</p>}
          {!historyNotice && history.length === 0 && <p>No saved placement analyses for this campaign yet.</p>}
          {history.map(job => (
            <div className="studioHistoryRow" key={job.id}>
              <div><b>{job.platform} · {job.placement_type.replaceAll("_", " ")}</b><small>{new Date(job.created_at).toLocaleString()}</small></div>
              <span className={"studioJobStatus " + job.status}>{job.status}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
