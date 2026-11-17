"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyCampaignFunding } from "@/lib/campaign-funding";

export default function VerifyClient() {
  const params = useSearchParams();
  const campaign = params.get("campaign") || "";
  const reference = params.get("reference") || params.get("trxref") || "";
  const [status, setStatus] = useState("Confirming your payment…");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!campaign || !reference) {
        if (active) setError("Payment confirmation details are missing.");
        return;
      }

      const result = await verifyCampaignFunding(campaign, reference);
      if (!active) return;
      if (result.error || !result.data) {
        setError(result.error?.message || "Payment could not be confirmed.");
        return;
      }

      if (result.data.funded) {
        setStatus(
          result.data.alreadyConfirmed
            ? "This payment was already confirmed. Your campaign funding is recorded."
            : "Payment confirmed. Your campaign is fully funded and ready for review from your campaigns dashboard.",
        );
      } else {
        setStatus(
          "Payment confirmed and held, but the campaign's current budget is not fully covered. It remains a draft. Contact AdBridge support before attempting another payment.",
        );
      }
    })();

    return () => { active = false; };
  }, [campaign, reference]);

  return (
    <main className="formPage">
      <div className="formCard">
        <span className="eyebrow">PAYMENT CONFIRMATION</span>
        <h1>{error ? <><em>Payment</em> needs attention.</> : status}</h1>
        {error && <div className="successBox">{error}</div>}
        {!error && <div className="successBox">{status}</div>}
        <Link className="primary fullButton" href="/advertiser/campaigns">
          Open my campaigns →
        </Link>
      </div>
    </main>
  );
}
