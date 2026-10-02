import { Suspense } from "react";
import ResultsClient from "./results-client";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <ResultsClient />
    </Suspense>
  );
}
