"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "adbridge_consent_v1";

export default function ConsentManager() {
  const [choice, setChoice] = useState<"measurement" | "essential" | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "measurement" || stored === "essential") setChoice(stored);
      else setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function choose(value: "measurement" | "essential") {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    setChoice(value);
    setOpen(false);
  }

  return (
    <>
      {open && (
        <aside role="dialog" aria-modal="false" aria-labelledby="privacy-choice-title" style={{
          position:"fixed",left:16,right:16,bottom:16,zIndex:1000,maxWidth:720,margin:"0 auto",
          padding:20,borderRadius:18,border:"1px solid #ffffff24",background:"#071713",
          color:"#effff9",boxShadow:"0 18px 60px #0009"
        }}>
          <b id="privacy-choice-title">Your privacy choices</b>
          <p style={{fontSize:13,lineHeight:1.6,color:"#b5c9c3",margin:"8px 0 14px"}}>
            AdBridge uses essential storage to keep the service working. With your permission, we also use visitor and session identifiers to measure ad delivery, control frequency and detect invalid activity. You can change this choice later. Read our <Link href="/privacy" style={{color:"#78ffdc"}}>Privacy Policy</Link>.
          </p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button className="primary" type="button" onClick={() => choose("measurement")}>Allow measurement</button>
            <button className="secondary" type="button" onClick={() => choose("essential")}>Essential only</button>
          </div>
        </aside>
      )}
      {!open && choice && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Manage privacy choices" style={{
          position:"fixed",right:12,bottom:12,zIndex:900,border:"1px solid #ffffff30",
          borderRadius:999,padding:"8px 12px",background:"#071713",color:"#dffefa",
          fontSize:11,cursor:"pointer",boxShadow:"0 4px 18px #0006"
        }}>Privacy choices</button>
      )}
    </>
  );
}
