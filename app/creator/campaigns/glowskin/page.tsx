"use client";
import Link from "next/link";
import {useState} from "react";
export default function GlowSkin(){
 const [accepted,setAccepted]=useState(false);
 return <main className="formPage"><Link href="/creator/campaigns" className="back">← Campaigns</Link><div className="formCard wide">
 <span className="eyebrow">CAMPAIGN DETAILS</span><h1>GlowSkin <em>Creator Launch</em></h1><p>Show the GlowSkin product naturally in a short TikTok video and tell your audience what makes it useful.</p>
 <div className="detailGrid"><section><h2>Your job</h2><ul><li>Make one original vertical video.</li><li>Show the product clearly for at least 3 seconds.</li><li>Mention GlowSkin naturally.</li><li>Use the supplied campaign link in your caption.</li></ul><h2>Before you accept</h2><p>You will have the campaign instructions available while you create. Your work is reviewed before payment is released.</p></section>
 <aside><span className="eyebrow">PAYMENT</span><h2>₦35,000</h2><p>Paid after the advertiser approves your completed work.</p>{accepted?<><div className="successBox">Campaign accepted ✓</div><Link className="primary" href="/creator/work">Open my active work →</Link></>:<button className="primary" onClick={()=>setAccepted(true)}>Accept & start →</button>}</aside></div>
 </div></main>
}