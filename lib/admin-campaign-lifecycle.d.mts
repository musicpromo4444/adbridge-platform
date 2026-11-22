export type CampaignLifecycleFilter =
  | "all"
  | "draft"
  | "funded"
  | "active"
  | "paused"
  | "completed"
  | "closed"
  | "cancelled";

export interface AdminCampaignLifecycleSummary {
  total: number;
  draft: number;
  funded: number;
  active: number;
  paused: number;
  completed: number;
  closed: number;
  cancelled: number;
  needs_reconciliation: number;
}

export interface AdminCampaignLifecycleCampaign {
  id: string;
  name: string | null;
  goal: string | null;
  platform: string | null;
  payment_method: string | null;
  payment_rate: number | null;
  max_budget: number;
  funded_amount: number;
  committed_spend: number;
  remaining_funded_budget: number;
  desired_results: number | null;
  status: Exclude<CampaignLifecycleFilter, "all">;
  completion_reason: "budget_exhausted" | "target_reached" | "manual" | null;
  completed_at: string | null;
  created_at: string;
  required_next_result: number | null;
  can_fund_next_result: boolean | null;
  needs_reconciliation: boolean;
}

export interface AdminCampaignLifecycleOverview {
  generated_at: string;
  summary: AdminCampaignLifecycleSummary;
  campaigns: AdminCampaignLifecycleCampaign[];
  truncated: boolean;
}

export function parseAdminCampaignLifecycleOverview(
  value: unknown
): AdminCampaignLifecycleOverview;
