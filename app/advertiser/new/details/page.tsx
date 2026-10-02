import { Suspense } from "react";
import DetailsClient from "./DetailsClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <DetailsClient />
    </Suspense>
  );
}
