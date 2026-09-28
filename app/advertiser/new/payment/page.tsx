"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState} from "react";
const payments=[["job","For making and posting a video"],["views","For getting views"],["clicks","For bringing people to my website"],["installs","For getting app installs"],["actions","For sign-ups or purchases"],["placement","For showing my product in creator videos"]];
export default function Payment(){
 const p=useSearchParams(); const goal=p.get("goal")||"video", platform=p.get("platform")||"TikTok";
 const name=p.get("name")||"",instructions=p.get("instructions")||"",assets=p.get("assets")||"";
 const [method,setMethod]=useState("job"),[rate,setRate]=useState(""),[budget,setBudget]=useState(""),[results,setResults]=useState("");
 const next="/advertiser/fund?goal="+encodeURIComponent(goal)+"&platform="+encodeURIComponent(platform)+"&method="+method+"&name="+encodeURIComponent(name)+"&instructions="+encodeURIComponent(instructions)+"&assets="+encodeURIComponent(assets)+"&rate="+encodeURIComponent(rate)+"&budget="+encodeURIComponent(budget)+"&results="+encodeURIComponent(results);
 return <main className="formPage"><Link href={"/advertiser/new/details?goal="+encodeURIComponent(goal)} className="back">← Campaign details</Link><div className="formCard wide"><span className="eyebrow">STEP 3 OF 5</span><h1>Choose how you want to <em>pay creators.</em></h1><p><b>{platform}</b> · You decide the result and the maximum amount you are willing to spend.</p>
 <div className="choices">{payments.map(([id,title])=><button key={id} type="button" className={method===id?"selected":""} onClick={()=>setMethod(id)}><strong>{title}</strong></button>)}</div>
 <div className="formGrid"><div><label>Payment rate</label><input className="textInput" value={rate} onChange={e=>setRate(e.target.value)} placeholder={method==="views"?"₦ per 1,000 views":"₦ per completed result"}/></div><div><label>Maximum campaign budget</label><input className="textInput" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="₦ 0"/></div></div>
 <label>How many results do you want?</label><input className="textInput" value={results} onChange={e=>setResults(e.target.value)} placeholder={method==="views"?"e.g. 100,000 views":"e.g. 100 creators or completed actions"}/>
 <div className="infoBox"><b>You only pay for approved results.</b><p>Your campaign budget is held safely until creators complete the work and you approve it.</p></div><Link className="primary" href={next}>Review campaign →</Link></div></main>
}