"use client";
import Link from "next/link";
import {useState} from "react";

const goals=[
["video","Make and post a video","Creators make content about my product and post it."],
["traffic","Bring people to my website","Creators send real people to my website."],
["installs","Get app installs","Creators help people discover and install my app."],
["product","Show my product in videos","My product appears naturally inside creator content."],
["sales","Get sign-ups or purchases","Creators help me get a specific action."],
["views","Get my ad seen","I want people to see my campaign."],
["other","Something else","I have a different campaign idea."]
];

export default function NewAd(){
 const [goal,setGoal]=useState("video");
 return <main className="formPage">
  <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
  <div className="formCard wide">
   <span className="eyebrow">STEP 1 OF 5</span>
   <h1>What do you want <em>creators to achieve?</em></h1>
   <p>Start with the result you want. AdBridge will guide you through the rest.</p>
   <div className="choices">
    {goals.map(([id,title,desc])=><button key={id} className={goal===id?"selected":""} onClick={()=>setGoal(id)} type="button"><strong>{title}</strong><small>{desc}</small></button>)}
   </div>
   <Link className="primary" href={"/advertiser/new/details?goal="+goal}>Continue →</Link>
  </div>
 </main>
}