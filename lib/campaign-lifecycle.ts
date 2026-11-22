export type CampaignCompletionReason =
  | "budget_exhausted"
  | "target_reached"
  | "manual"
  | null;

export function completionReasonLabel(reason: CampaignCompletionReason | string | undefined): string {
  switch (reason) {
    case "budget_exhausted":
      return "Budget exhausted or insufficient for another payable result";
    case "target_reached":
      return "Campaign target reached";
    case "manual":
      return "Completed by AdBridge administration";
    default:
      return "Completed";
  }
}

export function completionReasonSummary(reason: CampaignCompletionReason | string | undefined): string {
  switch (reason) {
    case "budget_exhausted":
      return "AdBridge stopped delivery because the remaining funded amount cannot cover another payable result.";
    case "target_reached":
      return "The campaign reached its configured target. New paid activity is no longer accepted.";
    case "manual":
      return "Campaign delivery was completed by AdBridge administration.";
    default:
      return "Campaign delivery has ended. Check the campaign record for its final status.";
  }
}
