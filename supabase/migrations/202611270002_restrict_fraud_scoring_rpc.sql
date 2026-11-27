-- Keep the fraud scoring primitive internal.
-- Event assessors and server-owned workflows invoke it from trusted database code;
-- browser clients must not be able to submit arbitrary source/evidence and obtain
-- a trusted scoring result directly.
revoke all on function public.adbridge_score_event(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

grant execute on function public.adbridge_score_event(text, text, jsonb, integer, integer)
  to service_role;

-- The click assessment trigger runs through its SECURITY DEFINER owner and remains
-- able to invoke the scoring primitive after the client-facing grants are removed.
