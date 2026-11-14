export type NormalizedClickPayload = {
  slug: string;
  visitorKey: string;
  referrerOrigin: string | null;
};

export type NormalizedConversionPayload = {
  campaignId: string;
  clickId: string;
  externalConversionId: string;
  actionType: string;
  value: number;
};

export function normalizeClickPayload(input: unknown): NormalizedClickPayload | null;
export function normalizeConversionPayload(input: unknown): NormalizedConversionPayload | null;
export function isSafeHttpUrl(value: unknown): value is string;
