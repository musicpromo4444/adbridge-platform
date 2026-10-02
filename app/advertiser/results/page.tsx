import { Suspense } from "react";
import ResultsClient from "./ResultsClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <ResultsClient />
    </Suspense>
  );
}
