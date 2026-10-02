import { Suspense } from "react";
import SubmitClient from "./submit-client";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <SubmitClient />
    </Suspense>
  );
}
