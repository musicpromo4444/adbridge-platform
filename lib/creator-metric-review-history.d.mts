export type CreatorMetricReviewStatus = "pending" | "approved" | "rejected";

export type CreatorMetricReviewHistoryItem = {
  id: string;
  claimedMetric: string | null;
  targetMetric: string | null;
  evidenceUrl: string | null;
  creatorNote: string | null;
  status: CreatorMetricReviewStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type CreatorMetricReviewHistoryCursor = {
  createdAt: string;
  id: string;
};

export type CreatorMetricReviewHistoryPage = {
  items: CreatorMetricReviewHistoryItem[];
  nextCursor: CreatorMetricReviewHistoryCursor | null;
};

export function parseCreatorMetricReviewHistory(payload: unknown): CreatorMetricReviewHistoryPage;
