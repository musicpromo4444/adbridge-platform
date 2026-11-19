do $$
declare r jsonb;
begin
  r:=public.adbridge_score_event('video_view','client','{"playback_started":true,"watch_seconds":30,"heartbeat_count":10,"page_visible":true}'::jsonb,0,0);
  if (r->>'verified')::boolean or (r->>'payable')::boolean then raise exception 'client-only video view was accepted'; end if;

  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true}'::jsonb,0,0);\n  if (r->>'verified')::boolean then raise exception 'platform view without an explicit verified count was accepted'; end if;\n\n  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true,"verified_view_count":2500,"delta_views":100,"seconds_since_previous":60}'::jsonb,0,0);
  if not (r->>'verified')::boolean or (r->>'payable')::boolean then raise exception 'trusted platform view metric gate failed'; end if;

  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true,"verified_view_count":900000,"delta_views":600000,"seconds_since_previous":60}'::jsonb,0,0);
  if r->>'risk_status'<>'review' or (r->>'verified')::boolean then raise exception 'extreme platform view velocity did not enter review'; end if;

  r:=public.adbridge_score_event('click','platform_api_verified','{"server_verified":true,"destination_loaded":true}'::jsonb,0,0);
  if r->>'event_type'<>'click' or (r->>'payable')::boolean then raise exception 'click was conflated with a payable view'; end if;

  r:=public.adbridge_score_event('video_view','client','{"watch_seconds":"not-a-number","heartbeat_count":"oops"}'::jsonb,0,0);
  if (r->>'verified')::boolean then raise exception 'malformed playback evidence passed'; end if;

  r:=public.adbridge_score_event('click','client','{"destination_loaded":true}'::jsonb,25,0);
  if r->>'risk_status'<>'review' then raise exception 'visitor velocity did not trigger review'; end if;

  r:=public.adbridge_score_event('impression','client','{"automation_detected":true}'::jsonb,0,0);
  if r->>'risk_status'<>'blocked' then raise exception 'automation signal did not block event'; end if;
end $$;