"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { completionReasonLabel, completionReasonSummary } from "@/lib/campaign-lifecycle";
import { refreshCreatorSubmissionMetrics, type CreatorMetricRefreshResult } from "@/lib/creator-metrics";

type CampaignInfo = {
  name: string;
  goal: string;
  platform: string | null;
  payment_rate: number | null;
  instructions: string | null;
  status: string;
  completion_reason: string | null;
  completed_at: string | null;
  payment_method: string | null;
};

type Job = {
  id: string;
  status: string;
  campaign_id: string;
  campaigns?: CampaignInfo | CampaignInfo[] | null;
};

type Submission = {
  id: string; campaign_id: string; creator_campaign_id: string | null;
  posted_url: string | null; external_video_id: string | null; status: string;
  target_metric: number | null; current_metric: number | null; metric_status: string | null;
  metric_verified_at: string | null; last_metric_check_at: string | null;
  tracking_error: string | null; tracking_platform: string | null;
};
function money(value: number | null | undefined) { return "₦" + Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 }); }
function payoutMessage(result: CreatorMetricRefreshResult) {
  if (!result.reached) return result.stale_snapshot
    ? `The platform returned ${result.provider_views.toLocaleString("en-NG")} views, but AdBridge kept the higher saved count of ${result.views.toLocaleString("en-NG")}.`
    : `Latest platform-reported count: ${result.views.toLocaleString("en-NG")} / ${result.target.toLocaleString("en-NG")} views. No CPM payout was triggered.`;
  if (result.payout?.paid) return result.payout.duplicate
    ? "The view target is reached. The existing CPM payment was already recorded."
    : `The view target is reached. A CPM payment of ${money(result.payout.amount || 0)} was recorded in the AdBridge ledger.`;
  const reasons: Record<string, string> = { campaign_not_payable: "the campaign is not currently payable", submission_not_awaiting_payment: "the submission is not awaiting payment", metrics_not_verified: "the metric verification is incomplete", target_not_reached: "the saved metric is below the target", budget_exhausted: "the campaign has no remaining payable budget" };
  return `The platform-reported target is reached, but no CPM payout was released because ${reasons[result.payout?.reason || ""] || "the payout conditions were not met"}.`;
}

function getCampaign(job: Job): CampaignInfo | null {
  if (Array.isArray(job.campaigns)) return job.campaigns[0] || null;
  return job.campaigns || null;
}

export default function Work() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [refreshingId, setRefreshingId] = useState("");
  const [notice, setNotice] = useState("");
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
    const [jobsResponse, submissionsResponse] = await Promise.all([
      supabase.from("creator_campaigns")
        .select("id,status,campaign_id,campaigns(name,goal,platform,payment_rate,payment_method,instructions,status,completion_reason,completed_at)")
        .eq("creator_id", user.id)
        .order("accepted_at", { ascending: false }),
      supabase.from("submissions")
        .select("id,campaign_id,creator_campaign_id,posted_url,external_video_id,status,target_metric,current_metric,metric_status,metric_verified_at,last_metric_check_at,tracking_error,tracking_platform")
        .eq("creator_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (jobsResponse.error || submissionsResponse.error) {
      setError("Your campaign work or submission metrics could not be loaded. Please refresh.");
      setJobs([]); setSubmissions([]);
    } else {
      setJobs((jobsResponse.data || []) as unknown as Job[]);
      setSubmissions((submissionsResponse.data || []) as Submission[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refreshMetrics(submissionId: string) {
    if (!supabase) return;
    setRefreshingId(submissionId); setError(""); setNotice("");
    try { const result = await refreshCreatorSubmissionMetrics(supabase, submissionId); setNotice(payoutMessage(result)); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The platform metric check could not be completed."); }
    finally { setRefreshingId(""); }
  }

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
        {notice && <div className="successBox" role="status">{notice}</div>}
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

                {(() => {
                  const method = (campaign?.payment_method || "").toLowerCase();
                  const isCpm = method === "cpm" || method === "views";
                  const jobSubmissions = submissions.filter(submission => submission.creator_campaign_id === job.id || (!submission.creator_campaign_id && submission.campaign_id === job.campaign_id));
                  return jobSubmissions.map(submission => {
                    const current = Math.max(0, Number(submission.current_metric || 0));
                    const target = Math.max(0, Number(submission.target_metric || 0));
                    const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                    const canRefresh = isCpm && !!(submission.posted_url || submission.external_video_id) && !["rejected", "changes_requested"].includes(submission.status);
                    return <section className="infoBox" key={submission.id}>
                      <div className="choiceRow"><b>SUBMISSION · {submission.status.replaceAll("_", " ").toUpperCase()}</b>{submission.tracking_platform && <small>{submission.tracking_platform.toUpperCase()}</small>}</div>
                      {submission.posted_url && <p><a href={submission.posted_url} target="_blank" rel="noreferrer">Open your published post ↗</a></p>}
                      {isCpm && target > 0 && <>
                        <p><strong>Platform-reported views:</strong> {current.toLocaleString("en-NG")} / {target.toLocaleString("en-NG")}</p>
                        <progress value={Math.min(current, target)} max={target} aria-label={`View target progress: ${progress}%`} style={{ width: "100%" }} />
                        <small>{submission.metric_status === "verified" ? "Target reached according to the connected platform API." : "Metrics are pending or still below the campaign target."}{submission.last_metric_check_at ? ` Last checked ${new Date(submission.last_metric_check_at).toLocaleString()}.` : " No successful platform check has been recorded yet."}</small>
                        {submission.tracking_error && <p role="alert">Last tracking error: {submission.tracking_error}</p>}
                        {canRefresh && <button className="primary" type="button" disabled={refreshingId === submission.id} onClick={() => void refreshMetrics(submission.id)}>{refreshingId === submission.id ? "Checking platform…" : "Refresh platform metrics →"}</button>}
                        <small>AdBridge uses the connected platform's reported view count. It does not treat link clicks or creator-entered figures as verified views.</small>
                      </>}
                    </section>;
                  });
                })()}

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
