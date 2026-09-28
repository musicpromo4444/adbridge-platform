"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";

export default function Details(){
 const params=useSearchParams();
 const goal=params.get("goal")||"video";
 const [platform,setPlatform]=useState("TikTok");
 return <main className="formPage">
  <Link href={"/advertiser/new?goal="+goal} className="back">← Back</Link>
  <div className="formCard wide">
   <span className="eyebrow">STEP 2 OF 5</span>
   <h1>Tell creators exactly <em>what to do.</em></h1>
   <p>Be as clear as possible. Creators will see these instructions before accepting your campaign.</p>
   <label>Campaign name</label>
   <input className="textInput" placeholder="e.g. Summer product launch"/>
   <label>What should the creator do?</label>
   <textarea placeholder="Example: Make a 30–60 second video showing the product, mention the main benefit and include our link."/>
   <label>What can you provide?</label>
   <div className="choices compact"><button type="button">Product photos/video</button><button type="button">Product or sample</button><button type="button">Logo + brand assets</button><button type="button">Website/app link</button></div>
   <label>Where should it be posted?</label>
   <div className="choices compact">
    {["TikTok","Instagram","YouTube","Facebook"].map(x=><button type="button" key={x} className={platform===x?"selected":""} onClick={()=>setPlatform(x)}>{x}</button>)}
   </div>
   <Link className="primary" href={"/advertiser/new/payment?goal="+goal+"&platform="+encodeURIComponent(platform)}>Continue →</Link>
  </div>
 </main>
}