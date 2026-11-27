"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep details in server/runtime logs; never expose stack traces to visitors.
    console.error("AdBridge route error", error.digest || "unidentified");
  }, [error]);

  return (
    <main className="formPage">
      <div className="formCard" role="alert">
        <span className="eyebrow">ADBRIDGE · RECOVERY</span>
        <h1>That didn't <em>work.</em></h1>
        <p>Something went wrong while loading this page. Your account and campaign records have not been intentionally changed.</p>
        <div className="choiceRow">
          <button className="primary" onClick={() => reset()}>Try again</button>
          <Link className="secondary" href="/">Return home</Link>
        </div>
      </div>
    </main>
  );
}
