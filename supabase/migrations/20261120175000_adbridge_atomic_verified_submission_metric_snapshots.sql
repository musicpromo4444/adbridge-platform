-- Persist platform-reported CPM metrics and release eligible payout in one transaction.
-- The service role is the only caller; existing RLS remains enabled on both source tables.

create or replace function private.record_submission_metric_snapshot(
  p_submission_id uuid,
  p_platform text,
  p_external_video_id text,
  p_metric_value bigint,
  p_raw_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.submissions%rowtype;
  v_campaign public.campaigns%rowtype;
  v_snapshot_id uuid;
  v_current_metric bigint;
  v_target_metric bigint;
  v_reached boolean;
  v_payout jsonb := null;
  v_checked_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_submission_id is null
     or nullif(trim(coalesce(p_platform, '')), '') is null
     or nullif(trim(coalesce(p_external_video_id, '')), '') is null
     or length(trim(p_external_video_id)) > 200
     or p_metric_value is null
     or p_metric_value < 0 then
    raise exception 'valid submission, platform, video id and non-negative metric are required'
      using errcode = '22023';
  end if;

  if lower(trim(p_platform)) not in ('youtube', 'tiktok', 'x', 'instagram', 'facebook') then
    raise exception 'unsupported metric platform' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_raw_data, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_raw_data, '{}'::jsonb)::text) > 65536 then
    raise exception 'metric evidence must be a JSON object no larger than 64 KB'
      using errcode = '22023';
  end if;

  select *
    into v_submission
    from public.submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  if v_submission.status not in ('waiting', 'approved') then
    raise exception 'submission is not eligible for metric tracking' using errcode = '55000';
  end if;

  select *
    into v_campaign
    from public.campaigns
   where id = v_submission.campaign_id
   for update;

  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_campaign.payment_method, '')) not in ('cpm', 'views') then
    raise exception 'submission is not attached to a CPM campaign' using errcode = '22023';
  end if;

  v_target_metric := coalesce(v_submission.target_metric, 0);
  if v_target_metric <= 0 then
    raise exception 'submission has no positive view target' using errcode = '55000';
  end if;

  v_current_metric := greatest(coalesce(v_submission.current_metric, 0), p_metric_value);
  v_reached := v_current_metric >= v_target_metric;

  -- The history row is inserted first. Any insert/trigger failure aborts this
  -- transaction before the submission summary or creator payout can change.
  insert into public.submission_metrics (
    submission_id,
    platform,
    external_video_id,
    metric_name,
    metric_value,
    checked_at,
    source,
    raw_data
  ) values (
    p_submission_id,
    lower(trim(p_platform)),
    trim(p_external_video_id),
    'views',
    p_metric_value,
    v_checked_at,
    'platform_api',
    coalesce(p_raw_data, '{}'::jsonb)
  )
  returning id into v_snapshot_id;

  update public.submissions
     set tracking_platform = lower(trim(p_platform)),
         external_video_id = trim(p_external_video_id),
         current_metric = v_current_metric,
         last_metric_check_at = v_checked_at,
         tracking_error = null,
         metric_status = case
           when v_reached then 'verified'
           else 'tracking'
         end,
         metric_verified_at = case
           when v_reached then coalesce(v_submission.metric_verified_at, v_checked_at)
           else null
         end
   where id = p_submission_id;

  if v_reached then
    -- This existing service-role-only function locks the same submission and
    -- campaign rows and enforces the funded budget and unique creator payment.
    v_payout := public.release_cpm_submission_payment(p_submission_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'snapshot_id', v_snapshot_id,
    'platform', lower(trim(p_platform)),
    'video_id', trim(p_external_video_id),
    'provider_views', p_metric_value,
    'views', v_current_metric,
    'target', v_target_metric,
    'reached', v_reached,
    'stale_snapshot', p_metric_value < coalesce(v_submission.current_metric, 0),
    'checked_at', v_checked_at,
    'payout', v_payout
  );
end;
$function$;

create or replace function public.record_submission_metric_snapshot(
  p_submission_id uuid,
  p_platform text,
  p_external_video_id text,
  p_metric_value bigint,
  p_raw_data jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.record_submission_metric_snapshot(
    p_submission_id,
    p_platform,
    p_external_video_id,
    p_metric_value,
    p_raw_data
  );
$function$;

grant usage on schema private to service_role;

revoke all on function private.record_submission_metric_snapshot(uuid, text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.record_submission_metric_snapshot(uuid, text, text, bigint, jsonb)
  to service_role;

revoke all on function public.record_submission_metric_snapshot(uuid, text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_submission_metric_snapshot(uuid, text, text, bigint, jsonb)
  to service_role;

comment on function public.record_submission_metric_snapshot(uuid, text, text, bigint, jsonb)
  is 'Atomically persists a platform-reported CPM metric snapshot, updates the submission summary, and attempts the existing budget-gated payout.';
