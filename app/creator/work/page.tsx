"use client";
import Link from "next/link";
import {useState} from "react";
export default function Work(){
 const [status,setStatus]=useState<"active"|"submitted">("active");
 return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard wide"><span className="eyebrow">MY WORK</span><h1>Track your <em>campaign jobs.</em></h1>
 <div className="opps"><article><b>{status==="submitted"?"WAITING FOR APPROVAL":"ACTIVE JOB"}</b><h3>GlowSkin Creator Launch</h3><p>One TikTok video · ₦35,000 · Due in 4 days</p><h3>What you need to do</h3><ul><li>Show GlowSkin clearly for at least 3 seconds.</li><li>Mention the product naturally.</li><li>Use the campaign link in your caption.</li></ul>
 {status==="active"?<><Link className="primary" href="/creator/studio">Create with AI Studio →</Link><Link className="secondary" href="/creator/submit">Send completed work →</Link></>:<div className="successBox">Your advertiser is reviewing the submission.</div>}</article>
 <article><b>ACTIVE</b><h3>Volt Energy Mention</h3><p>Short video · ₦20,000 · Due in 7 days</p><Link href="/creator/studio">Create video →</Link></article></div>
 <div className="quick"><h2>Campaign journey</h2><p>Accepted → Create → Submit → Advertiser approves → Payment released</p></div>
 </div></main>
}