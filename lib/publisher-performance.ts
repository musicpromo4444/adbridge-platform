import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePublisherPerformance, type PublisherPerformance } from "./publisher-performance.mjs";

export type { PublisherPerformance, PublisherEventMetric, PublisherDailyMetric } from "./publisher-performance.mjs";

export async function loadPublisherPerformance(
  client: SupabaseClient,
  days: number,
): Promise<PublisherPerformance> {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("Choose a reporting window between 1 and 90 days.");
  }
  const { data, error } = await client.rpc("get_publisher_delivery_performance", {
    p_days: days,
  });
  if (error) throw new Error("Verified publisher performance could not be loaded. Please retry.");
  return parsePublisherPerformance(data);
}
