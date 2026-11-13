"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Platform = {
  id: string;
  name: string;
  format: string;
  ratio: string;
  disclosure: string;
};

type PlacementCandidate = {
  label: string;
  left: string;
  top: string;
  width: string;
  x: number;
  y: number;
  widthRatio: number;
  heightRatio: number;
};

type ScanResult = {
  candidate: PlacementCandidate;
  score: number;
  sampledFrames: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
};

const platforms: Platform[] = [
  { id: "tiktok", name: "TikTok", format: "Vertical video", ratio: "9:16", disclosure: "Add TikTok's required commercial-content disclosure before publishing." },
  { id: "youtube", name: "YouTube", format: "YouTube video", ratio: "16:9 / source", disclosure: "Use YouTube's paid-promotion declaration when it applies." },
  { id: "shorts", name: "YouTube Shorts", format: "Short video", ratio: "9:16", disclosure: "Use YouTube's paid-promotion declaration when it applies." },
  { id: "facebook", name: "Facebook Feed", format: "Feed video", ratio: "Source-aware", disclosure: "Add Facebook's applicable branded-content disclosure before publishing." },
  { id: "facebook-reels", name: "Facebook Reels", format: "Vertical Reel", ratio: "9:16", disclosure: "Add Facebook's applicable branded-content disclosure before publishing." },
  { id: "x", name: "X", format: "Post video", ratio: "Source-aware", disclosure: "Follow X's current paid-content disclosure requirements." },
  { id: "snapchat", name: "Snapchat", format: "Vertical video", ratio: "9:16", disclosure: "Follow Snapchat's current commercial-content disclosure requirements." },
  { id: "instagram", name: "Instagram Reels", format: "Vertical Reel", ratio: "9:16", disclosure: "Use Instagram's applicable paid-partnership disclosure before publishing." }
];

const placements = [
  { id: "card", name: "Product card", description: "A compact branded card overlay." },
  { id: "floating", name: "Floating logo", description: "A small brand mark positioned over the video." },
  { id: "logo", name: "Logo + CTA", description: "A brand mark with a short call to action." },
  { id: "natural", name: "Scene callout", description: "A suggested overlay position; in-scene compositing is not included." }
];

type MediaEventName = "loadedmetadata" | "loadeddata" | "seeked";

function waitForMediaEvent(video: HTMLVideoElement, eventName: MediaEventName): Promise<void> {
  return new Promise((resolve, reject) => {
    if (eventName === "loadedmetadata" && video.readyState >= 1) return resolve();
    if (eventName === "loadeddata" && video.readyState >= 2) return resolve();

    let timeout: number | undefined;
    const cleanup = () => {
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener("error", onError);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not read this video. Try an MP4 or WebM file."));
    };

    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
    timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video scanning took too long. Try a shorter video or a supported MP4/WebM file."));
    }, 8000);
  });
}

function scoreFrameRegion(
  pixels: ImageData,
  canvasWidth: number,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number
): number {
  const data = pixels.data;
  let totalDifference = 0;
  let samples = 0;
  const endX = Math.min(canvasWidth - 2, x + regionWidth);
  const endY = Math.min(pixels.height - 2, y + regionHeight);

  for (let row = Math.max(1, y); row < endY; row += 3) {
    for (let column = Math.max(1, x); column < endX; column += 3) {
      const index = (row * canvasWidth + column) * 4;
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const rightGray = data[index + 4] * 0.299 + data[index + 5] * 0.587 + data[index + 6] * 0.114;
      const belowIndex = index + canvasWidth * 4;
      const belowGray = data[belowIndex] * 0.299 + data[belowIndex + 1] * 0.587 + data[belowIndex + 2] * 0.114;
      totalDifference += Math.abs(gray - rightGray) + Math.abs(gray - belowGray);
      samples += 1;
    }
  }

  return samples ? totalDifference / samples / 510 : 1;
}

async function scanVideoFrames(videoUrl: string, platformId: string): Promise<ScanResult> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";

  try {
    const metadataReady = waitForMediaEvent(video, "loadedmetadata");
    video.src = videoUrl;
    video.load();
    await metadataReady;
    await waitForMediaEvent(video, "loadeddata");

    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("This video does not have readable dimensions or duration.");
    }

    const duration = video.duration;
    const times = [0.2, 0.5, 0.8]
      .map((part) => Math.min(duration * part, Math.max(0, duration - 0.03)))
      .filter((time, index, all) => all.findIndex((other) => Math.abs(other - time) < 0.02) === index);

    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    const canvasWidth = Math.max(96, Math.round(video.videoWidth * scale));
    const canvasHeight = Math.max(96, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The browser could not start the local video scanner.");

    const verticalPlatforms = ["tiktok", "shorts", "facebook-reels", "snapchat", "instagram"];
    const isVertical = verticalPlatforms.includes(platformId);
    const candidates: PlacementCandidate[] = isVertical
      ? [
          { label: "Upper-left", left: "8%", top: "13%", width: "38%", x: 0.08, y: 0.13, widthRatio: 0.38, heightRatio: 0.14 },
          { label: "Middle-left", left: "8%", top: "36%", width: "38%", x: 0.08, y: 0.36, widthRatio: 0.38, heightRatio: 0.14 },
          { label: "Upper-centre", left: "53%", top: "13%", width: "38%", x: 0.53, y: 0.13, widthRatio: 0.38, heightRatio: 0.14 }
        ]
      : [
          { label: "Top-left", left: "6%", top: "9%", width: "28%", x: 0.06, y: 0.09, widthRatio: 0.28, heightRatio: 0.18 },
          { label: "Top-right", left: "66%", top: "9%", width: "28%", x: 0.66, y: 0.09, widthRatio: 0.28, heightRatio: 0.18 },
          { label: "Middle-left", left: "6%", top: "41%", width: "28%", x: 0.06, y: 0.41, widthRatio: 0.28, heightRatio: 0.18 },
          { label: "Middle-right", left: "66%", top: "41%", width: "28%", x: 0.66, y: 0.41, widthRatio: 0.28, heightRatio: 0.18 },
          { label: "Bottom-left", left: "6%", top: "72%", width: "28%", x: 0.06, y: 0.72, widthRatio: 0.28, heightRatio: 0.18 },
          { label: "Bottom-right", left: "66%", top: "72%", width: "28%", x: 0.66, y: 0.72, widthRatio: 0.28, heightRatio: 0.18 }
        ];

    const candidateScores = candidates.map((candidate) => ({ candidate, samples: [] as number[] }));

    for (const time of times) {
      if (Math.abs(video.currentTime - time) > 0.015) {
        const seekReady = waitForMediaEvent(video, "seeked");
        video.currentTime = time;
        await seekReady;
      }

      context.drawImage(video, 0, 0, canvasWidth, canvasHeight);
      const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight);
      for (const item of candidateScores) {
        item.samples.push(
          scoreFrameRegion(
            pixels,
            canvasWidth,
            Math.floor(canvasWidth * item.candidate.x),
            Math.floor(canvasHeight * item.candidate.y),
            Math.floor(canvasWidth * item.candidate.widthRatio),
            Math.floor(canvasHeight * item.candidate.heightRatio)
          )
        );
      }
    }

    const ranked = candidateScores
      .map((item) => {
        const mean = item.samples.reduce((sum, value) => sum + value, 0) / item.samples.length;
        const spread = Math.max(...item.samples) - Math.min(...item.samples);
        return { candidate: item.candidate, score: mean + spread * 0.2 };
      })
      .sort((a, b) => a.score - b.score);

    if (!ranked.length) throw new Error("No suitable preview position could be calculated.");

    return {
      candidate: ranked[0].candidate,
      score: ranked[0].score,
      sampledFrames: times.length,
      duration,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

export default function Studio() {
  const [platform, setPlatform] = useState("tiktok");
  const [placement, setPlacement] = useState("floating");
  const [videoUrl, setVideoUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; platform: string | null }[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("campaign");
    (async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const query = supabase.from("creator_campaigns")
        .select("campaign_id,campaigns(id,name,platform)")
        .eq("status", "accepted")
        .eq("creator_id", user.id);
      const { data } = await query;
      const list = (data ?? []).map((row: any) => row.campaigns).filter(Boolean);
      setCampaigns(list);
      setCampaignId(requested && list.some((item: any) => item.id === requested) ? requested : (list[0]?.id || ""));
    })();
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const selected = useMemo(
    () => platforms.find((item) => item.id === platform) ?? platforms[0],
    [platform]
  );

  function choosePlatform(id: string) {
    setPlatform(id);
    setScanResult(null);
    setSaveMessage("");
  }

  function chooseVideo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setSaveMessage("Please choose a video file. The studio currently scans video uploads only.");
      return;
    }
    setFileName(file.name);
    setVideoUrl(URL.createObjectURL(file));
    setVideoDimensions(null);
    setScanResult(null);
    setSaveMessage("");
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setSaveMessage("Choose a PNG, JPG or WebP logo image.");
      return;
    }
    setLogoFileName(file.name);
    setLogoUrl(URL.createObjectURL(file));
    setSaveMessage("");
  }

  async function analyze() {
    if (!videoUrl) {
      setSaveMessage("Upload a video before scanning.");
      return;
    }
    setAnalyzing(true);
    setScanResult(null);
    setSaveMessage("");
    try {
      const result = await scanVideoFrames(videoUrl, platform);
      setVideoDimensions({ width: result.videoWidth, height: result.videoHeight });
      setScanResult(result);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The video could not be scanned.");
    } finally {
      setAnalyzing(false);
    }
  }

  const previewAspectRatio = videoDimensions
    ? videoDimensions.width + "/" + videoDimensions.height
    : "16/9";
  const previewMaxWidth = videoDimensions && videoDimensions.height > videoDimensions.width
    ? Math.round(430 * videoDimensions.width / videoDimensions.height) + "px"
    : "100%";

  return <main className="formPage studioPage">
    <Link href="/creator" className="back">← Creator Dashboard</Link>

    <div className="formCard wide studioCard">
      <span className="eyebrow">ADBRIDGE SMART PLACEMENT STUDIO</span>
      <h1>Find a clearer place for your <em>brand.</em></h1>
      <p>
        Upload a video and an optional logo. AdBridge samples frames on this device and compares
        candidate positions. Your video is not uploaded for this preview, and the original file is never changed.
      </p>

      <div className="studioSteps">
        <div className="active"><b>01</b><span>Choose platform</span></div>
        <div><b>02</b><span>Scan video frames</span></div>
        <div><b>03</b><span>Compare positions</span></div>
        <div><b>04</b><span>Review suggestion</span></div>
      </div>

      <label>Where are you posting?</label>
      <div className="platformGrid">
        {platforms.map((item) =>
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
          <strong>{selected.name} layout guide selected</strong>
          <small>The scan compares positions and avoids the lower caption area on short-form layouts. Check the final result manually.</small>
        </div>
      </div>

      <div className="studioWorkspace">
        <section className="studioPanel">
          <label>Your video</label>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            onChange={(event) => { chooseVideo(event.target.files?.[0]); event.target.value = ""; }}
          />
          {fileName && <div className="filePicked">✓ {fileName}</div>}

          <label>Brand logo (optional)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => { chooseLogo(event.target.files?.[0]); event.target.value = ""; }}
          />
          {logoFileName && <div className="filePicked">✓ {logoFileName}</div>}

          <label>Campaign</label>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="">Choose an accepted campaign</option>
            {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}{item.platform ? " · " + item.platform : ""}</option>)}
          </select>

          <label>Placement style</label>
          <div className="placementChoices">
            {placements.map((item) =>
              <button
                type="button"
                key={item.id}
                className={placement === item.id ? "placementChoice selected" : "placementChoice"}
                onClick={() => { setPlacement(item.id); setScanResult(null); }}
              >
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </button>
            )}
          </div>

          <button className="primary fullButton" onClick={analyze} disabled={analyzing || !videoUrl}>
            {analyzing ? "Scanning video frames…" : "Scan video for a logo position →"}
          </button>
        </section>

        <section className="studioPanel previewPanel">
          <div className="previewHeader">
            <div><span className="eyebrow">LOCAL PREVIEW</span><h2>{selected.name}</h2></div>
            <span className="formatBadge">{selected.ratio}</span>
          </div>

          <div
            className="aiPreview"
            style={{
              width: "100%",
              aspectRatio: previewAspectRatio,
              height: "auto",
              maxHeight: 430,
              maxWidth: previewMaxWidth,
              margin: "0 auto"
            }}
          >
            {videoUrl
              ? <video
                  src={videoUrl}
                  controls
                  muted
                  playsInline
                  onLoadedMetadata={(event) => setVideoDimensions({
                    width: event.currentTarget.videoWidth,
                    height: event.currentTarget.videoHeight
                  })}
                />
              : <div className="previewPlaceholder"><span>▶</span><b>Upload your video</b><small>A local scan will compare possible logo positions.</small></div>
            }

            {scanResult && <div
              className="placementMock"
              style={{
                left: scanResult.candidate.left,
                top: scanResult.candidate.top,
                bottom: "auto",
                width: scanResult.candidate.width,
                minWidth: 0
              }}
            >
              {logoUrl ? <img
                src={logoUrl}
                alt="Brand logo preview"
                style={{ display: "block", maxWidth: "100%", maxHeight: 34, objectFit: "contain", marginBottom: 5 }}
              /> : <span>BRAND</span>}
              <b>{selectedCampaign?.name || "Sponsored brand"}</b>
              <small>{placement === "card" ? "PRODUCT CARD" : placement === "logo" ? "LOGO + CTA" : placement === "natural" ? "SCENE CALLOUT" : "FLOATING LOGO"}</small>
            </div>}
          </div>

          {scanResult && <div className="analysisResult">
            <div className="resultTitle"><span>✓</span><strong>Suggested position: {scanResult.candidate.label}</strong></div>
            <p>
              Compared {scanResult.sampledFrames} frames from a {Math.round(scanResult.duration)}-second video.
              The suggestion favors the candidate area with the least visual detail across those frames.
            </p>
            <div className="checkList">
              <div><span>✓</span> Frames sampled locally</div>
              <div><span>✓</span> Lowest-detail area selected</div>
              <div><span>✓</span> Video stays in your browser</div>
              <div><span>!</span> Check faces, captions and UI manually</div>
            </div>
            <p><b>Important:</b> This is a visual-complexity scan, not face or text recognition. The logo is shown as an overlay preview only; no video export is created.</p>
          </div>}
        </section>
      </div>

      <div className="complianceBox">
        <div className="complianceTop">
          <div><span className="eyebrow">HOW THE SUGGESTION WORKS</span><h2>{selected.name}</h2></div>
          <span className="statusPill">LOCAL SCAN</span>
        </div>

        <div className="complianceGrid">
          <div><b>📍 Position</b><p>Compares candidate regions and favors the lowest visual-detail score across sampled frames.</p></div>
          <div><b>⏱ Sampling</b><p>Checks frames near 20%, 50% and 80% of the video. It does not insert or time an advertisement.</p></div>
          <div><b>🛡 Limitations</b><p>Faces, captions, text and platform controls are not detected precisely. Review the suggested position yourself.</p></div>
          <div><b>✓ Disclosure</b><p>{selected.disclosure}</p></div>
        </div>
      </div>

      {saveMessage && <div className="successBox" role="status">{saveMessage}</div>}

      {scanResult && <div className="finalCheck">
        <div>
          <span className="eyebrow">FINAL REVIEW</span>
          <h2>Review your logo position</h2>
          <p>Preview only. AdBridge has not changed the original video or exported a new file. Check that the logo does not cover a face, caption or important action.</p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => setSaveMessage("Preview marked as reviewed. The source video remains unchanged; no export was created.")}
        >
          Mark preview reviewed
        </button>
      </div>}
    </div>
  </main>;
}
