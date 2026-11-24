export type AdminMetricReviewHistoryCursor = {
  id: string;
  reviewedAt: string;
};

export type AdminMetricReviewHistoryItem = {
  id: string;
  campaignName: string;
  trackingPlatform: string | null;
  evidenceUrl: string | null;
  claimedMetric: string;
  targetMetric: string | null;
  currentMetric: string | null;
  creatorNote: string | null;
  reviewNote: string | null;
  status: "approved" | "rejected";
  createdAt: string;
  reviewedAt: string;
};

export type AdminMetricReviewHistoryPage = {
  items: AdminMetricReviewHistoryItem[];
  nextCursor: AdminMetricReviewHistoryCursor | null;
};

export function parseAdminMetricReviewHistory(value: unknown): AdminMetricReviewHistoryPage;
