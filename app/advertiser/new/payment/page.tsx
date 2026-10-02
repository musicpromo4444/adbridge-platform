import { Suspense } from "react";
import PaymentClient from "./payment-client";

export default function Page() {
  return (
    <Suspense fallback={<main className="formPage"><div className="formCard"><h1>Loading…</h1></div></main>}>
      <PaymentClient />
    </Suspense>
  );
}
