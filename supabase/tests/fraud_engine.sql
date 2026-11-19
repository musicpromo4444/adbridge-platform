-- Lightweight regression tests for AdBridge fraud scoring.
do $$
declare r jsonb;
begin
  r:=public.adbridge_score_event('video_view','client','{"playback_started":true,"watch_seconds":30,"heartbeat_count":10,"page_visible":true}'::jsonb,0,0);
  if (r->>'verified')::boolean then raise exception 'client-only video view was incorrectly verified'; end if;
  if (r->>'payable')::boolean then raise exception 'client-only video view was incorrectly payable'; end if;
  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true,"playback_started":true,"watch_seconds":30,"heartbeat_count":10,"page_visible":true}'::jsonb,0,0);
  if not (r->>'verified')::boolean then raise exception 'trusted evidence video view did not verify'; end if;
  if (r->>'payable')::boolean then raise exception 'event should remain non-payable until billing workflow consumes it'; end if;
  r:=public.adbridge_score_event('click','platform_api_verified','{"server_verified":true,"destination_loaded":true}'::jsonb,0,0);
  if (r->>'event_type')='video_view' then raise exception 'click was reclassified as a view'; end if;
  r:=public.adbridge_score_event('video_view','client','{"watch_seconds":"not-a-number","heartbeat_count":"oops"}'::jsonb,0,0);
  if (r->>'verified')::boolean then raise exception 'malformed metadata was incorrectly verified'; end if;
  r:=public.adbridge_score_event('click','client','{"destination_loaded":true}'::jsonb,25,0);
  if (r->>'risk_status')<>'review' then raise exception 'high visitor velocity did not enter review'; end if;
end $$;
