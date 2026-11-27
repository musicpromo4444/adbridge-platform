export type PublisherEventMetric = {
  event_type: "impression" | "click" | "video_view" | "install" | "conversion";
  total: number;
  verified: number;
  payable: number;
  under_review: number;
  blocked: number;
  rejected: number;
};
export type PublisherDailyMetric = Omit<PublisherEventMetric, "event_type"> & { day: string };
export type PublisherPerformance = {
  days: number;
  from: string;
  generated_at: string;
  total_events: number;
  verified_events: number;
  payable_events: number;
  under_review_events: number;
  blocked_events: number;
  rejected_events: number;
  event_types: PublisherEventMetric[];
  daily: PublisherDailyMetric[];
};
export function parsePublisherPerformance(value: unknown): PublisherPerformance;
