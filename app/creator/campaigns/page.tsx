"use client";
import Link from "next/link";
import {useMemo,useState} from "react";

const campaigns=[
 {brand:"GlowSkin",title:"Show our product in a short video",platform:"TikTok",category:"Beauty",pay:"₦35,000",goal:"Make and post a video",href:"/creator/campaigns/glowskin"},
 {brand:"Volt Energy",title:"Talk about Volt Energy naturally",platform:"Instagram",category:"Lifestyle",pay:"₦20,000",goal:"Make and post a video",href:"/creator/campaigns/glowskin"},
 {brand:"Streamly",title:"Show the app and invite your audience",platform:"YouTube Shorts",category:"Apps",pay:"₦45,000",goal:"Get app installs",href:"/creator/campaigns/glowskin"},
 {brand:"Nova Sneakers",title:"Show the new sneaker in your content",platform:"TikTok",category:"Fashion",pay:"₦28,000",goal:"Show my product in videos",href:"/creator/campaigns/glowskin"}
];

export default function Campaigns(){
 const [search,setSearch]=useState("");
 const [platform,setPlatform]=useState("All");
 const filtered=useMemo(()=>campaigns.filter(c=>(platform==="All"||c.platform===platform)&&Object.values(c).join(" ").toLowerCase().includes(search.toLowerCase())),[search,platform]);
 return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link>
 <div className="formCard wide"><span className="eyebrow">CAMPAIGNS FOR YOU</span><h1>Choose your next <em>opportunity.</em></h1>
 <div className="filterRow"><input className="textInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search campaigns, brands or goals..." /><select className="textInput" value={platform} onChange={e=>setPlatform(e.target.value)}><option>All</option><option>TikTok</option><option>Instagram</option><option>YouTube Shorts</option></select></div>
 <div className="opps">{filtered.map(c=><article key={c.brand}><b>{c.brand}</b><h3>{c.title}</h3><p>{c.platform} · {c.category} · {c.goal}</p><strong>{c.pay}</strong><Link href={c.href}>View campaign →</Link></article>)}</div>
 {filtered.length===0&&<div className="successBox">No campaigns match your search.</div>}</div></main>
}