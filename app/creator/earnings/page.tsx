"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadMyCreatorEarningsSummary, type CreatorEarningsSummary } from "@/lib/creator-earnings";

type Payment = {
  id: string;
  amount: number | null;
  type: string | null;
  status: string | null;
  created_at: string;
  campaigns?: { name: string }[] | null;
};

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
};

const money = (value: number) =>
  "₦" + value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Earnings() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [summary, setSummary] = useState<CreatorEarningsSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) {
      setHistoryError("AdBridge database connection is not available.");
      setSummaryError("The creator earnings ledger is unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const [paymentResult, withdrawalResult, summaryResult] = await Promise.all([
      supabase
        .from("campaign_payments")
        .select("id,amount,type,status,created_at,campaigns(name)")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("creator_withdrawals")
        .select("id,amount,status,created_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false }),
      loadMyCreatorEarningsSummary(),
    ]);

    if (paymentResult.error || withdrawalResult.error) {
      setHistoryError("We couldn't load your payment history. Please refresh and try again.");
    } else {
      setPayments((paymentResult.data ?? []) as Payment[]);
      setWithdrawals((withdrawalResult.data ?? []) as Withdrawal[]);
      setHistoryError("");
    }

    if (summaryResult.error || !summaryResult.data) {
      setSummary(null);
      setSummaryError(
        summaryResult.error?.message || "The creator earnings ledger returned no summary.",
      );
    } else {
      setSummary(summaryResult.data);
      setSummaryError("");
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function requestWithdrawal() {
    if (!supabase) {
      setMessage("AdBridge database connection is not available.");
      return;
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid withdrawal amount.");
      return;
    }

    if (!summary) {
      setMessage("Your confirmed balance is unavailable. Refresh before requesting payment.");
      return;
    }

    if (value > summary.availableBalance) {
      setMessage("That amount is greater than your available balance. Refresh and try again.");
      return;
    }

    setBusy(true);
    setMessage("");

    const { data, error } = await supabase.rpc("request_creator_withdrawal", {
      p_amount: value,
    });

    setBusy(false);

    if (error) {
      setMessage(
        error.code === "P0001"
          ? "Your available balance changed. Refresh your earnings and try again."
          : "The withdrawal request could not be confirmed. No success was recorded.",
      );
      await load();
      return;
    }

    const result =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;

    if (
      !result ||
      typeof result.id !== "string" ||
      result.status !== "pending" ||
      Number(result.amount) !== value
    ) {
      setMessage("The server did not return a confirmed withdrawal request. Refresh your history.");
      await load();
      return;
    }

    setAmount("");
    setMessage("Withdrawal request submitted for review.");
    await load();
  }

  return (
    <main className="formPage">
      <Link href="/creator" className="back">
        ← Creator Dashboard
      </Link>

      <div className="formCard wide">
        <span className="eyebrow">YOUR EARNINGS</span>
        <h1>
          Your work. Your <em>money.</em>
        </h1>

        {loading && !summary && (
          <div className="successBox">Loading your confirmed earnings…</div>
        )}

        {summaryError && (
          <div className="successBox" role="alert">
            {summaryError}
          </div>
        )}

        {summary && (
          <section className="quick" aria-labelledby="creator-earnings-summary">
            <h2 id="creator-earnings-summary">Earnings and withdrawal balance</h2>
            <div className="statsGrid">
              <div>
                <b>Released earnings</b>
                <strong>{money(summary.releasedEarnings)}</strong>
              </div>
              <div>
                <b>Pending earnings</b>
                <strong>{money(summary.pendingEarnings)}</strong>
              </div>
              <div>
                <b>Reserved withdrawals</b>
                <strong>{money(summary.reservedWithdrawals)}</strong>
              </div>
              <div>
                <b>Available to withdraw</b>
                <strong>{money(summary.availableBalance)}</strong>
              </div>
            </div>
            <p>
              Only released creator payments are available to withdraw. Pending, held or
              approved earnings are not spendable until they are released. Pending and approved
              withdrawal requests reserve part of your available balance.
            </p>
          </section>
        )}

        <label htmlFor="withdrawal-amount">How much do you want to withdraw?</label>
        <input
          id="withdrawal-amount"
          className="textInput"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="₦ 0.00"
          inputMode="decimal"
        />
        <button
          className="primary"
          onClick={requestWithdrawal}
          disabled={busy || loading || !summary || summary.availableBalance <= 0}
        >
          {busy ? "Submitting…" : "Request withdrawal →"}
        </button>

        {message && (
          <div className="successBox" role="status" aria-live="polite">
            {message}
          </div>
        )}

        <h2>Payment history</h2>
        {loading ? (
          <div className="successBox">Loading payments…</div>
        ) : historyError ? (
          <div className="successBox" role="alert">
            {historyError}
          </div>
        ) : payments.length ? (
          <div className="opps">
            {payments.map((payment) => (
              <article key={payment.id}>
                <b>{(payment.status || "pending").toUpperCase()}</b>
                <h3>{payment.campaigns?.[0]?.name || "Creator payment"}</h3>
                <p>
                  {(payment.type || "payment").replaceAll("_", " ")} ·{" "}
                  {new Date(payment.created_at).toLocaleDateString()}
                </p>
                <strong>{money(Number(payment.amount || 0))}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="successBox">No payments yet.</div>
        )}

        <h2>Withdrawal history ({summary?.withdrawalCount ?? "—"})</h2>
        {loading ? (
          <div className="successBox">Loading withdrawal requests…</div>
        ) : historyError ? (
          <div className="successBox" role="alert">
            {historyError}
          </div>
        ) : withdrawals.length ? (
          <div className="opps">
            {withdrawals.map((withdrawal) => (
              <article key={withdrawal.id}>
                <b>{withdrawal.status.toUpperCase()}</b>
                <h3>{money(Number(withdrawal.amount))}</h3>
                <small>{new Date(withdrawal.created_at).toLocaleString()}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="successBox">No withdrawal requests yet.</div>
        )}
      </div>
    </main>
  );
}
