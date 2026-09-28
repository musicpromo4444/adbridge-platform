"use client";
import Link from "next/link";
import {useState} from "react";
export default function Review(){
 const [state,setState]=useState<"review"|"approved"|"changes">("review");
 return <main className="formPage"><Link href="/advertiser" className="back">← Advertiser Dashboard</Link><div className="formCard wide"><span className="eyebrow">CREATOR WORK TO REVIEW</span><h1>Check the <em>finished work.</em></h1><p>GlowSkin Creator Launch · Creator submission</p>
 <div className="reviewBox"><div className="videoMock"><span>▶</span><small>Creator video preview</small></div><div><h2>{state==="approved"?"Approved ✓":state==="changes"?"Changes requested":"What to check"}</h2><p>{state==="review"?"Make sure the product is visible, your instructions were followed and the post link is correct.":state==="approved"?"Payment of ₦35,000 has been released to the creator.":"The creator has been asked to update the submission."}</p>
 {state==="review"&&<div className="reviewActions"><button className="primary" onClick={()=>setState("approved")}>Approve & release ₦35,000</button><button className="secondary" onClick={()=>setState("changes")}>Request changes</button></div>}
 {state!=="review"&&<Link className="secondary" href="/advertiser">Back to advertiser dashboard →</Link>}</div></div>
 </div></main>
}