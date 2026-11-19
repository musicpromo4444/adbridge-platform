"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  recordCreatorWithdrawalPayout,
  reviewCreatorWithdrawal,
  type WithdrawalReviewStatus,
} from "@/lib/admin-withdrawals";

type Withdrawal = {
  id: string;
  creator_id: string;
  amount: number | string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  paid_at: string | null;
  payout_reference: string | null;
};

type Filter = "pending" | "approved" | "paid" | "rejected" | "all";

const money = (value: number | string) =>
  "₦" +
  Number(value).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Withdrawals() {
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [payoutReferences, setPayoutReferences] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) {
      setError("AdBridge database connection is not available.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      window.location.href = "/login";
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      setRows([]);
      setError("Administrator access required.");
      setLoading(false);
      return;
    }

    const { data, error: loadError } = await supabase
      .from("creator_withdrawals")
      .select("id,creator_id,amount,status,created_at,reviewed_at,admin_note,paid_at,payout_reference")
      .order("created_at", { ascending: false });

    if (loadError) {
      setRows([]);
      setError(
        "Could not load withdrawal requests. Check the deployed withdrawal-review and payout-recording migrations and administrator read policy.",
      );
    } else {
      setRows((data ?? []) as Withdrawal[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(row: Withdrawal, decision: WithdrawalReviewStatus) {
    setBusy(row.id);
    setError("");
    setMessage("");

    const result = await reviewCreatorWithdrawal({
      withdrawalId: row.id,
      decision,
      adminNote: notes[row.id] || null,
    });

    if (result.error || !result.data) {
      setError(
        result.error?.message ||
          "The server did not confirm this withdrawal decision.",
      );
      setBusy("");
      return;
    }

    if (result.data.unchanged) {
      setMessage("This withdrawal already has that decision. No duplicate notification was sent.");
    } else if (decision === "approved") {
      setMessage(
        "Withdrawal approved for payout processing. No bank transfer is recorded by this action.",
      );
    } else {
      setMessage("Withdrawal rejected. Its reserved balance is now available to the creator again.");
    }

    setBusy("");
    await load();
  }

  async function recordPayout(row: Withdrawal) {
    const payoutReference = (payoutReferences[row.id] || "").trim();
    if (!payoutReference) {
      setError("Enter the bank or transfer reference before recording this payout.");
      setMessage("");
      return;
    }

    setBusy(row.id);
    setError("");
    setMessage("");

    const result = await recordCreatorWithdrawalPayout({
      withdrawalId: row.id,
      payoutReference,
    });

    if (result.error || !result.data) {
      setError(result.error?.message || "The server did not confirm the payout record.");
      setBusy("");
      return;
    }

    setMessage(
      result.data.unchanged
        ? "This payout reference was already recorded. No duplicate notification was sent."
        : "Payout recorded as sent with reference " +
            result.data.payoutReference +
            ". This is administrator confirmation, not independent bank verification.",
    );
    setBusy("");
    await load();
  }

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const approvedCount = rows.filter((row) => row.status === "approved").length;
  const paidCount = rows.filter((row) => row.status === "paid").length;
  const rejectedCount = rows.filter((row) => row.status === "rejected").length;
  const visibleRows = rows.filter(
    (row) => filter === "all" || row.status === filter,
  );

  return (
    <main className="formPage">
      <Link href="/admin" className="back">
        ← Admin
      </Link>

      <div className="formCard wide">
        <span className="eyebrow">ADMIN · WITHDRAWALS</span>
        <h1>
          Creator <em>withdrawals.</em>
        </h1>
        <p>
          Review creator requests and record completed transfers. Only record a payout
          after sending it through your bank or payment provider. AdBridge stores the
          reference you provide; it does not independently verify bank settlement.
        </p>

        <div className="statsGrid">
          <div>
            <b>Pending review</b>
            <strong>{pendingCount}</strong>
          </div>
          <div>
            <b>Approved for payout</b>
            <strong>{approvedCount}</strong>
          </div>
          <div>
            <b>Payout recorded</b>
            <strong>{paidCount}</strong>
          </div>
          <div>
            <b>Rejected</b>
            <strong>{rejectedCount}</strong>
          </div>
        </div>

        <div className="choices compact" aria-label="Filter withdrawals">
          {(["pending", "approved", "paid", "rejected", "all"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>

        {error && (
          <div className="successBox" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="successBox" role="status" aria-live="polite">
            {message}
          </div>
        )}

        {loading ? (
          <div className="successBox">Loading withdrawal requests…</div>
        ) : visibleRows.length ? (
          <div className="opps">
            {visibleRows.map((row) => (
              <article key={row.id}>
                <b>{row.status.toUpperCase()}</b>
                <h3>{money(row.amount)}</h3>
                <p>Creator account: {row.creator_id}</p>
                <small>Requested {new Date(row.created_at).toLocaleString()}</small>

                {row.reviewed_at && (
                  <small>
                    Reviewed {new Date(row.reviewed_at).toLocaleString()}
                  </small>
                )}

                {row.admin_note && (
                  <p>
                    <strong>Admin note:</strong> {row.admin_note}
                  </p>
                )}

                {row.status === "pending" && (
                  <>
                    <label htmlFor={"withdrawal-note-" + row.id}>
                      Review note (optional, 500 characters maximum)
                    </label>
                    <textarea
                      id={"withdrawal-note-" + row.id}
                      value={notes[row.id] || ""}
                      maxLength={500}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      placeholder="Add a concise reason or processing note."
                    />
                    <div className="choiceRow">
                      <button
                        className="primary"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void decide(row, "approved")}
                      >
                        {busy === row.id ? "Saving…" : "Approve for payout"}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void decide(row, "rejected")}
                      >
                        Reject and release reserve
                      </button>
                    </div>
                  </>
                )}

                {row.status === "approved" && (
                  <>
                    <p>
                      Approved for payout processing. This amount remains reserved until
                      the transfer is recorded.
                    </p>
                    <label htmlFor={"payout-reference-" + row.id}>
                      Bank or transfer reference (required, 120 characters maximum)
                    </label>
                    <input
                      id={"payout-reference-" + row.id}
                      className="textInput"
                      value={payoutReferences[row.id] || ""}
                      maxLength={120}
                      onChange={(event) =>
                        setPayoutReferences((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      placeholder="Enter the transfer reference"
                    />
                    <button
                      className="primary"
                      type="button"
                      disabled={Boolean(busy) || !(payoutReferences[row.id] || "").trim()}
                      onClick={() => void recordPayout(row)}
                    >
                      {busy === row.id ? "Recording…" : "Record payout sent"}
                    </button>
                    <small>
                      Only use this after initiating the transfer. This action records an
                      admin-supplied reference; it does not contact your bank.
                    </small>
                  </>
                )}

                {row.status === "paid" && (
                  <>
                    <small>
                      Payout recorded {row.paid_at ? new Date(row.paid_at).toLocaleString() : ""}
                    </small>
                    <p>
                      <strong>Transfer reference:</strong> {row.payout_reference || "Not available"}
                    </p>
                    <small>Recorded by an administrator; not independently verified by a bank API.</small>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="successBox">
            {filter === "pending"
              ? "No pending withdrawal requests."
              : "No withdrawals match this filter."}
          </div>
        )}
      </div>
    </main>
  );
}
