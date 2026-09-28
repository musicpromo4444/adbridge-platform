"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Platform = {
  id: string; name: string; format: string; ratio: string;
  safe: string; restricted: string; disclosure: string; placement: string; note: string;
};

const platforms: Platform[] = [
  {id:"tiktok",name:"TikTok",format:"TikTok video",ratio:"9:16",safe:"Keep important text and product elements away from platform controls.",restricted:"Do not add promotional watermarks, logos or promotional text as an unwanted overlay through the posting integration.",disclosure:"Commercial content disclosure required when promoting a brand, product or service.",placement:"Lower-middle clear area",note:"The creator must review the final TikTok preview and complete the required commercial-content disclosure before posting."},
  {id:"youtube",name:"YouTube",format:"YouTube video",ratio:"16:9 or source",safe:"Keep the product placement inside the creator's content and away from important visual information.",restricted:"Do not burn a third-party pre-roll, mid-roll, post-roll or bumper into the creator video.",disclosure:"Paid promotion declaration required for paid product placement, sponsorship or endorsement.",placement:"Natural scene/product area",note:"AdBridge treats YouTube product placement and endorsement differently from an embedded third-party video ad."},
  {id:"shorts",name:"YouTube Shorts",format:"Shorts",ratio:"9:16",safe:"Keep the creator and key text visible and avoid covering important content.",restricted:"Third-party video ad breaks cannot simply be burned into the Short.",disclosure:"Paid promotion declaration required when the Short contains branded content.",placement:"Lower clear area",note:"The final Short still needs the creator's YouTube paid-promotion declaration."},
  {id:"facebook",name:"Facebook Feed",format:"Feed video/image",ratio:"Source-aware",safe:"Keep the product inside clear content space and avoid covering important creator content.",restricted:"The AI will not intentionally cover faces, key text, logos or detected platform UI.",disclosure:"Branded-content disclosure may be required depending on the collaboration and posting method.",placement:"Clear side/lower area",note:"The exact Facebook publishing options can vary by account and content type, so AdBridge will show the creator the final check."},
  {id:"reels",name:"Facebook Reels",format:"Reel",ratio:"9:16",safe:"Use a vertical safe area and keep important content away from interface zones.",restricted:"Do not cover key creator content or add unwanted promotional branding through the posting integration.",disclosure:"Branded-content disclosure may be required.",placement:"Lower-middle clear area",note:"The creator gets a final preview before anything is posted."},
  {id:"instagram",name:"Instagram Reels",format:"Reel",ratio:"9:16",safe:"Use a vertical safe area and preserve faces, captions and important visual information.",restricted:"Do not cover important creator content with the advertiser placement.",disclosure:"Paid partnership/branded-content disclosure may be required.",placement:"Lower-middle clear area",note:"The final publishing step remains under the creator's control."}
];

const placements = [
  {id:"card",name:"Product card",description:"Small product panel that sits naturally in clear space."},
  {id:"floating",name:"Floating product",description:"Product follows a detected clear area while the scene moves."},
  {id:"logo",name:"Logo + CTA",description:"Compact brand mark and call-to-action in a safe area."},
  {id:"natural",name:"Natural placement",description:"AI places the product into a detected surface or scene."}
];

export default function Studio() {
  const [platform,setPlatform]=useState("tiktok");
  const [placement,setPlacement]=useState("floating");
  const [videoUrl,setVideoUrl]=useState("");
  const [fileName,setFileName]=useState("");
  const [analyzing,setAnalyzing]=useState(false);
  const [done,setDone]=useState(false);

  const selected=useMemo(()=>platforms.find(item=>item.id===platform) ?? platforms[0],[platform]);

  function choosePlatform(id:string){setPlatform(id);setDone(false);}
  function chooseVideo(file:File|undefined){
    if(!file)return;
    setFileName(file.name);
    setVideoUrl(URL.createObjectURL(file));
    setDone(false);
  }
  function analyze(){
    setAnalyzing(true); setDone(false);
    window.setTimeout(()=>{setAnalyzing(false);setDone(true);},1100);
  }

  return <main className="formPage studioPage">
    <Link href="/creator" className="back">← Creator Dashboard</Link>
    <div className="formCard wide studioCard">
      <span className="eyebrow">ADBRIDGE AI STUDIO</span>
      <h1>Make it fit <em>where you post.</em></h1>
      <p>Choose the exact destination first. AdBridge then prepares the content for that platform, checks its rules, finds clear space and shows you exactly where the advertiser's product can go.</p>

      <div className="studioSteps">
        <div className="active"><b>01</b><span>Choose platform</span></div>
        <div><b>02</b><span>Analyze content</span></div>
        <div><b>03</b><span>Place advertiser</span></div>
        <div><b>04</b><span>Check & export</span></div>
      </div>

      <label>Where are you posting?</label>
      <div className="platformGrid">
        {platforms.map(item=><button key={item.id} className={platform===item.id ? "platformButton selected":"platformButton"} onClick={()=>choosePlatform(item.id)} type="button">
          <strong>{item.name}</strong><small>{item.format} · {item.ratio}</small>
        </button>)}
      </div>

      <div className="ruleBanner"><div><span className="ruleDot"/><strong>{selected.name} rules active</strong></div><small>AdBridge changes the placement and checks below for this destination.</small></div>

      <div className="studioWorkspace">
        <section className="studioPanel">
          <label>Your content</label>
          <input type="file" accept="video/*,image/*" onChange={event=>chooseVideo(event.target.files?.[0])}/>
          {fileName&&<div className="filePicked">✓ {fileName}</div>}

          <label>Campaign</label>
          <select defaultValue="glowskin"><option value="glowskin">GlowSkin Creator Launch</option><option value="nova">Nova Sneakers</option><option value="volt">Volt Energy Mention</option></select>

          <label>How should the advertiser appear?</label>
          <div className="placementChoices">
            {placements.map(item=><button type="button" key={item.id} className={placement===item.id?"placementChoice selected":"placementChoice"} onClick={()=>setPlacement(item.id)}>
              <strong>{item.name}</strong><small>{item.description}</small>
            </button>)}
          </div>
          <button className="primary fullButton" onClick={analyze} disabled={analyzing}>{analyzing?"Analyzing your content…":"Analyze & create my preview →"}</button>
        </section>

        <section className="studioPanel previewPanel">
          <div className="previewHeader"><div><span className="eyebrow">LIVE PREVIEW</span><h2>{selected.name}</h2></div><span className="formatBadge">{selected.ratio}</span></div>
          <div className={"aiPreview "+(selected.ratio==="16:9 or source"?"widePreview":"")}>
            {videoUrl?<video src={videoUrl} controls muted playsInline/>:<div className="previewPlaceholder"><span>▶</span><b>Upload your content</b><small>The AI preview will appear here.</small></div>}
            {done&&<><div className="safeZone safeOne">SAFE</div><div className="safeZone safeTwo">SAFE</div><div className="blockedZone">KEEP CLEAR</div><div className="placementMock"><span>AD</span><b>{placement==="natural"?"Product placed naturally":"GlowSkin"}</b><small>AI placement</small></div></>}
          </div>
          {done&&<div className="analysisResult"><div className="resultTitle"><span>✓</span><strong>AI placement ready</strong></div><p>AdBridge found clear visual space and avoided the main content area for {selected.name}.</p><div className="checkList"><div><span>✓</span> Format: {selected.ratio}</div><div><span>✓</span> Placement: {selected.placement}</div><div><span>✓</span> Restricted area check completed</div><div><span>✓</span> Disclosure requirement identified</div></div></div>}
        </section>
      </div>

      <div className="complianceBox">
        <div className="complianceTop"><div><span className="eyebrow">DESTINATION CHECK</span><h2>{selected.name}</h2></div><span className="statusPill">RULES LOADED</span></div>
        <div className="complianceGrid">
          <div><b>✓ Safe area</b><p>{selected.safe}</p></div>
          <div><b>✓ What we avoid</b><p>{selected.restricted}</p></div>
          <div><b>! Disclosure</b><p>{selected.disclosure}</p></div>
          <div><b>AI recommendation</b><p>{selected.placement}. {selected.note}</p></div>
        </div>
      </div>

      {done&&<div className="finalCheck"><div><span className="eyebrow">FINAL CHECK</span><h2>Ready for your review</h2><p>The creator always sees the final result before posting. AdBridge does not silently publish content or hide required platform disclosures.</p></div><button className="secondary" type="button">Approve & export →</button></div>}
    </div>
  </main>
}
