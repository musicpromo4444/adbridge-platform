import { Suspense } from "react";
import FundClient from "./fund-client";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <FundClient />
    </Suspense>
  );
}
