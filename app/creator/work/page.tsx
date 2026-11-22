"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { completionReasonLabel, completionReasonSummary } from "@/lib/campaign-lifecycle";

type CampaignInfo = {
  name: string;
  goal: string;
  platform: string | null;
  payment_rate: number | null;
  instructions: string | null;
  status: string;
  completion_reason: string | null;
  completed_at: string | null;
};

type Job = {
  id: string;
  status: string;
  campaign_id: string;
  campaigns?: CampaignInfo | CampaignInfo[] | null;
};

function getCampaign(job: Job): CampaignInfo | null {
  if (Array.isArray(job.campaigns)) return job.campaigns[0] || null;
  return job.campaigns || null;
}

export default function Work() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("AdBridge database is not connected.");
      setLoading(false);
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }
    const { data, error: queryError } = await supabase
      .from("creator_campaigns")
      .select("id,status,campaign_id,campaigns(name,goal,platform,payment_rate,instructions,status,completion_reason,completed_at)")
      .eq("creator_id", user.id)
      .order("accepted_at", { ascending: false });
    if (queryError) setError("We couldn't load your campaign work. Please refresh and try again.");
    else setJobs((data || []) as unknown as Job[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="formPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">MY WORK</span>
        <h1>Track your <em>campaign jobs.</em></h1>
        <p>Accepted campaigns move through creation, submission, review and payment.</p>
        <div className="choiceRow">
          <Link className="secondary" href="/notifications">Notifications</Link>
          <Link className="secondary" href="/creator/earnings">Earnings ledger</Link>
        </div>

        {loading && <div className="successBox">Loading your work…</div>}
        {!loading && error && <div className="successBox" role="alert">{error}</div>}
        {!loading && !error && !jobs.length && (
          <div className="successBox">You have no accepted campaigns yet. <Link href="/creator/campaigns">Find a campaign →</Link></div>
        )}

        <div className="opps">
          {jobs.map(job => {
            const campaign = getCampaign(job);
            return (
              <article key={job.id}>
                <b>{job.status.replaceAll("_", " ").toUpperCase()}</b>
                <h3>{campaign?.name || "Campaign"}</h3>
                <p>{campaign?.platform || "Any platform"} · ₦{Number(campaign?.payment_rate || 0).toLocaleString("en-NG")}</p>
                {campaign?.instructions && <p>{campaign.instructions}</p>}

                {campaign?.status === "completed" && (
                  <div className="successBox">
                    <b>Campaign delivery ended: {completionReasonLabel(campaign.completion_reason)}.</b>
                    <p>{completionReasonSummary(campaign.completion_reason)}</p>
                    {campaign.completed_at && <small>Completed {new Date(campaign.completed_at).toLocaleString()}.</small>}
                    <p>This does not confirm your individual payment. Check the earnings ledger for any released amount.</p>
                  </div>
                )}

                {job.status === "submitted" ? (
                  <div className="successBox">Waiting for advertiser review.</div>
                ) : job.status === "approved" ? (
                  <div className="successBox">Approved. Check Earnings for any released payment; approval alone does not confirm a transfer.</div>
                ) : job.status === "completed" ? (
                  <div className="successBox">Your campaign job is complete. Check Earnings for the actual released-payment record.</div>
                ) : campaign?.status === "completed" ? (
                  <div className="successBox">Campaign delivery has ended. Do not start new deliverables for this campaign; check Earnings for any released amount.</div>
                ) : job.status === "accepted" || job.status === "in_progress" ? (
                  <div className="choiceRow">
                    <Link className="primary" href={"/creator/studio?campaign=" + job.campaign_id}>Create with AI Studio →</Link>
                    <Link className="secondary" href={"/creator/submit?job=" + job.id}>Send completed work →</Link>
                  </div>
                ) : (
                  <div className="successBox">Changes were requested. Update and resubmit through the normal submission process.</div>
                )}
              </article>
            );
          })}
        </div>

        <div className="quick">
          <h2>Campaign journey</h2>
          <p>Accepted → Create → Submit → Advertiser reviews → Approval → Payment</p>
        </div>
      </div>
    </main>
  );
}
