"use client";
import Link from "next/link";
import {useState} from "react";
export default function Submit(){
 const [sent,setSent]=useState(false);
 return <main className="formPage"><Link href="/creator/work" className="back">← My Work</Link><div className="formCard"><span className="eyebrow">SEND COMPLETED WORK</span><h1>Ready to <em>submit?</em></h1><p>GlowSkin Creator Launch · One TikTok video</p>
 <label>Upload your video</label><input type="file" accept="video/*"/><label>Paste your posted video link</label><input className="textInput" placeholder="https://..." /><label>Anything the advertiser should know?</label><textarea placeholder="Optional note"></textarea>
 <button className="primary" onClick={()=>setSent(true)}>{sent?"Sent for approval ✓":"Send for approval →"}</button>
 {sent&&<><div className="successBox">Your work is now waiting for the advertiser to review. You will be paid after approval.</div><Link className="secondary" href="/creator/work">Back to my work →</Link></>}</div></main>
}