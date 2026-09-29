"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Payment = {
  id: string;
  amount: number | null;
  type: string | null;
  status: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
};

export default function Earnings() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) { setLoading(false); setMessage("Payment system is not connected."); return; }
    const creatorId = localStorage.getItem("adbridge-creator-id");
    if (!creatorId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("campaign_payments")
      .select("id,amount,type,status,created_at,campaigns(name)")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) setMessage("We couldn't load your payments.");
    setPayments((data ?? []) as Payment[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const available = useMemo(() =>
    payments.filter(p => ["released","approved"].includes(p.status ?? ""))
      .reduce((sum,p) => sum + Number(p.amount || 0), 0), [payments]);

  const pending = useMemo(() =>
    payments.filter(p => ["held","pending"].includes(p.status ?? ""))
      .reduce((sum,p) => sum + Number(p.amount || 0), 0), [payments]);

  async function requestWithdrawal() {
    const creatorId = localStorage.getItem("adbridge-creator-id");
    const value = Number(amount);
    if (!supabase || !creatorId) return setMessage("Create your creator profile before requesting payment.");
    if (!value || value <= 0) return setMessage("Enter a valid withdrawal amount.");
    if (value > available) return setMessage("That amount is greater than your available balance.");
    setBusy(true);
    const { error } = await supabase.from("campaign_payments").insert({
      creator_id: creatorId,
      amount: value,
      type: "withdrawal",
      status: "pending"
    });
    setBusy(false);
    if (error) return setMessage("Your withdrawal request could not be submitted.");
    setAmount("");
    setMessage("Withdrawal request submitted for review.");
    load();
  }

  return (
    <main className="formPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">YOUR EARNINGS</span>
        <h1>Your work. Your <em>money.</em></h1>

        <div className="statsGrid">
          <div><b>Available</b><strong>₦{available.toLocaleString()}</strong></div>
          <div><b>Pending</b><strong>₦{pending.toLocaleString()}</strong></div>
          <div><b>Payments</b><strong>{payments.length}</strong></div>
        </div>

        <label>How much do you want to withdraw?</label>
        <input className="textInput" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₦ 0" inputMode="numeric" />
        <button className="primary" onClick={requestWithdrawal} disabled={busy}>
          {busy ? "Submitting…" : "Request withdrawal →"}
        </button>

        {message && <div className="successBox">{message}</div>}

        <h2>Payment history</h2>
        {loading && <div className="successBox">Loading payments…</div>}
        {!loading && payments.length === 0 && <div className="successBox">No payments yet. Complete an approved campaign to start earning.</div>}
        {!loading && payments.length > 0 && (
          <div className="opps">
            {payments.map(payment => (
              <article key={payment.id}>
                <b>{(payment.status || "pending").toUpperCase()}</b>
                <h3>{payment.campaigns?.name || "Creator payment"}</h3>
                <p>{(payment.type || "payment").replaceAll("_", " ")} · {new Date(payment.created_at).toLocaleDateString()}</p>
                <strong>₦{Number(payment.amount || 0).toLocaleString()}</strong>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}