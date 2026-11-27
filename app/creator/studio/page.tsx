"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
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
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); if (exportUrl) URL.revokeObjectURL(exportUrl); }, [videoUrl, exportUrl]);
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
    setAnalysisError(""); setAnalysis(null); setDone(false); setExportError(""); if(exportUrl){URL.revokeObjectURL(exportUrl);setExportUrl("");}
    if (!file.type.startsWith("video/")) { setAnalysisError("Choose a video file."); return; }
    if (file.size > 250 * 1024 * 1024) { setAnalysisError("Video files must be 250 MB or smaller."); return; }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file); setFileName(file.name); setVideoUrl(URL.createObjectURL(file)); setCurrentTime(0);
  }

  async function analyze() {
    if (!supabase) { setAnalysisError("AdBridge connection is unavailable."); return; }
    if (!campaignId || !selectedCampaignAsset?.asset_url) { setAnalysisError("Choose an accepted campaign with an image logo or brand asset."); return; }
    if (!videoFile) { setAnalysisError("Upload your video first."); return; }
    setAnalyzing(true); setDone(false); setAnalysis(null); setAnalysisError("");
    try {
      const captured = await captureFrames(videoFile);
      const { data, error: invokeError } = await supabase.functions.invoke("analyze-creator-placement", {
        body: { campaign_id: campaignId, campaign_asset_id: assetId, request_id: crypto.randomUUID(), platform, placement_type: placement, duration_seconds: captured.duration, frame_width: captured.width, frame_height: captured.height, frames: captured.frames }
      });
      if (invokeError || data?.error) throw new Error(data?.error || invokeError?.message || "AI placement analysis failed.");
      setAnalysis(data.result as PlacementResult); setModelName(String(data.model || "")); setDone(true);
      setCurrentTime(data.result?.placement?.start_seconds || 0);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "AI placement analysis failed. Retry.");
    } finally { setAnalyzing(false); }
  }


  async function exportPlacedVideo() {
    const video=videoRef.current, placement=analysis?.placement, logoUrl=selectedCampaignAsset?.asset_url;
    if(!video||!placement||!logoUrl){setExportError("A video and successful placement analysis are required.");return;}
    if(typeof MediaRecorder==="undefined"||typeof video.captureStream!=="function"){setExportError("Video export is not supported in this browser. Use the placement preview instead.");return;}
    setExporting(true);setExportError("");if(exportUrl){URL.revokeObjectURL(exportUrl);setExportUrl("");}
    const priorMuted=video.muted,priorVolume=video.volume;let raf=0;let recorder:MediaRecorder|null=null;
    try{
      const logo=new Image();logo.crossOrigin="anonymous";logo.src=logoUrl;await new Promise<void>((resolve,reject)=>{logo.onload=()=>resolve();logo.onerror=()=>reject(new Error("Campaign logo could not be loaded for video export."));});
      const canvas=document.createElement("canvas"),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas rendering is unavailable.");
      const videoStream=video.captureStream();const canvasStream=canvas.captureStream(30);const stream=new MediaStream([...canvasStream.getVideoTracks(),...videoStream.getAudioTracks()]);
      const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks:BlobPart[]=[];
      const recording=new Promise<Blob>((resolve,reject)=>{recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder!.onerror=()=>reject(new Error("Video recording failed."));recorder!.onstop=()=>resolve(new Blob(chunks,{type:recorder!.mimeType||"video/webm"}));});
      const draw=()=>{if(recorder?.state!=="recording")return;ctx.drawImage(video,0,0,canvas.width,canvas.height);if(video.currentTime>=placement.start_seconds&&video.currentTime<=placement.end_seconds){const x=placement.x*canvas.width,y=placement.y*canvas.height,w=placement.width*canvas.width,h=placement.height*canvas.height;if(placementType==="card"){ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(x,y,w,h);}ctx.drawImage(logo,x,y,w,h);}raf=requestAnimationFrame(draw);};
      video.currentTime=0;await new Promise<void>(resolve=>{video.onseeked=()=>resolve();});video.muted=false;video.volume=0;recorder.start(250);draw();await video.play();await new Promise<void>((resolve,reject)=>{video.onended=()=>resolve();video.onerror=()=>reject(new Error("Video playback failed during export."));});recorder.stop();const blob=await recording;stream.getTracks().forEach(t=>t.stop());canvasStream.getTracks().forEach(t=>t.stop());videoStream.getTracks().forEach(t=>t.stop());const url=URL.createObjectURL(blob);setExportUrl(url);
    }catch(e){if(recorder&&recorder.state!=="inactive")recorder.stop();setExportError(e instanceof Error?e.message:"Video export failed.");}finally{cancelAnimationFrame(raf);if(video){video.pause();video.muted=priorMuted;video.volume=priorVolume;}setExporting(false);}
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

          <label>Campaign logo / brand image</label>
          <select value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">Choose image asset</option>{campaignAssets.map(a=><option key={a.id} value={a.id}>{a.asset_type.replaceAll("_"," ")}</option>)}</select>
          {campaignId&&!campaignAssets.length&&<div className="successBox">This campaign has no image logo assets. Ask the advertiser to upload a PNG, JPG or WebP image.</div>}
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

          <button className="primary fullButton" onClick={()=>void analyze()} disabled={analyzing||!videoFile||!campaignId||!assetId}>
            {analyzing ? "Analyzing video frames…" : "Analyze actual video & placement →"}
          </button>
        </section>

        <section className="studioPanel previewPanel">
          <div className="previewHeader">
            <div><span className="eyebrow">PLACEMENT PREVIEW</span><h2>{selected.name}</h2></div>
            <span className="formatBadge">{selected.ratio}</span>
          </div>

          <div className={"aiPreview " + (selected.ratio === "16:9 / source" ? "widePreview" : "")} style={{position:"relative"}}>
            {videoUrl
              ? <video ref={videoRef} src={videoUrl} controls muted playsInline onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)}/>
              : <div className="previewPlaceholder"><span>▶</span><b>Upload your content</b><small>AI will choose the placement automatically.</small></div>
            }

            {analysis?.placement && <div style={{position:"absolute",left:analysis.placement.x*100+"%",top:analysis.placement.y*100+"%",width:analysis.placement.width*100+"%",height:analysis.placement.height*100+"%",display:currentTime>=analysis.placement.start_seconds&&currentTime<=analysis.placement.end_seconds?"block":"none",pointerEvents:"none",zIndex:4,boxSizing:"border-box",background:placement==="card"?"rgba(255,255,255,.92)":"transparent",padding:placement==="card"?"2%":"0",borderRadius:placement==="card"?"8px":"0"}}>{selectedCampaignAsset?.asset_url&&<img src={selectedCampaignAsset.asset_url} alt="Campaign logo placement preview" style={{width:"100%",height:"100%",objectFit:"contain"}}/>}</div>}
            {analysis?.placement && <div style={{position:"absolute",bottom:8,left:8,zIndex:5,background:"#071a11dd",color:"#e7fff0",padding:"5px 9px",borderRadius:8,fontSize:11}}>Placement {analysis.placement.start_seconds.toFixed(1)}–{analysis.placement.end_seconds.toFixed(1)}s · {Math.round(analysis.placement.confidence*100)}%</div>}
          </div>
          {analysisError && <div className="successBox" role="alert">{analysisError}</div>}
          {analysis && <div className="analysisResult"><div className="resultTitle"><span>{analysis.placement?"✓":"!"}</span><strong>{analysis.placement?"AI placement recommendation":"AI declined placement"}</strong></div><p>{analysis.reasoning}</p>{analysis.placement&&<div className="checkList"><div>Position: {analysis.placement.anchor}</div><div>Time window: {analysis.placement.start_seconds.toFixed(2)}–{analysis.placement.end_seconds.toFixed(2)}s</div><div>Confidence: {Math.round(analysis.placement.confidence*100)}%</div><div>Model: {modelName||"configured model"}</div></div>}{analysis.warnings?.length>0&&<div className="infoBox"><b>Warnings</b><ul>{analysis.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}</div>}
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

      {done && <div className="finalCheck"><div><span className="eyebrow">AI RESULT</span><h2>{analysis?.placement?"Placement plan ready for review":"No safe placement recommended"}</h2><p>Preview the overlay by playing or seeking the video into the recommended time window. Review the full video before publishing.</p>{analysis?.placement&&<button className="primary" type="button" disabled={exporting} onClick={()=>void exportPlacedVideo()}>{exporting?"Rendering video…":"Render & download placed video →"}</button>}{exportError&&<div className="successBox" role="alert">{exportError}</div>}{exportUrl&&<a className="secondary" href={exportUrl} download={(fileName.replace(/\.[^.]+$/,"")||"adbridge-placement")+".webm"}>Download rendered video →</a>}</div><button className="secondary" type="button" onClick={()=>{setAnalysis(null);setDone(false);setSaveMessage("Analysis cleared. You can adjust the placement style and analyze again.");}}>Analyze another →</button></div>}
    </div>
  </main>
}
