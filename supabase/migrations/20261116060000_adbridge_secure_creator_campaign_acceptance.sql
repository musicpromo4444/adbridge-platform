-- Create creator campaign jobs only through an authenticated, server-validated RPC.
-- The browser cannot choose a creator_id or bypass campaign, verification, or test gates.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;
comment on schema adbridge_private is
  'Private AdBridge database routines. Do not expose this schema through PostgREST.';

alter table public.creator_campaigns enable row level security;

-- Existing read and permitted status-transition access remains intact. New jobs must
-- be created by the RPC so creator identity and eligibility are derived server-side.
revoke insert on table public.creator_campaigns from public, anon, authenticated;

create or replace function adbridge_private.accept_creator_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_creator_role text;
  v_creator_verified boolean := false;
  v_verification_required boolean := false;
  v_campaign_status text;
  v_advertiser_id uuid;
  v_existing_job_id uuid;
  v_existing_job_status text;
  v_required_test_id uuid;
  v_job_id uuid;
  v_job_status text;
begin
  if v_creator_id is null then
    raise exception using
      errcode = '28000',
      message = 'Sign in before accepting a campaign.';
  end if;

  if p_campaign_id is null then
    raise exception using
      errcode = '22023',
      message = 'Choose a campaign before accepting it.';
  end if;

  select p.role, coalesce(p.verified, false)
    into v_creator_role, v_creator_verified
    from public.profiles p
   where p.id = v_creator_id
   for share;

  if not found or v_creator_role <> 'creator' then
    raise exception using
      errcode = '42501',
      message = 'A creator account is required to accept campaigns.';
  end if;

  -- Serialize acceptance with campaign status changes and other acceptances.
  select c.status, c.advertiser_id
    into v_campaign_status, v_advertiser_id
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Campaign not found.';
  end if;

  -- Make retries safe and preserve access to an already accepted job even if the
  -- advertiser later pauses the campaign or creator verification settings change.
  select j.id, j.status
    into v_existing_job_id, v_existing_job_status
    from public.creator_campaigns j
   where j.campaign_id = p_campaign_id
     and j.creator_id = v_creator_id
   for update;

  if found then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'job_id', v_existing_job_id,
      'status', v_existing_job_status
    );
  end if;

  if coalesce(v_campaign_status, '') <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'This campaign is not accepting new creators.';
  end if;

  select coalesce(s.require_creator_verification, false)
    into v_verification_required
    from public.platform_settings s
   where s.id = 1;

  if coalesce(v_verification_required, false) and not v_creator_verified then
    raise exception using
      errcode = '42501',
      message = 'This campaign requires an AdBridge-verified creator account.';
  end if;

  -- Match the creator-facing campaign page: the newest required test is the
  -- acknowledgement gate. Opening an external resource remains self-reported.
  select t.id
    into v_required_test_id
    from public.campaign_tests t
   where t.campaign_id = p_campaign_id
     and t.required is true
   order by t.created_at desc
   limit 1;

  if v_required_test_id is not null
     and not exists (
       select 1
         from public.creator_campaign_test_acknowledgements a
        where a.campaign_test_id = v_required_test_id
          and a.creator_id = v_creator_id
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'Complete the required campaign acknowledgement before accepting this campaign.';
  end if;

  insert into public.creator_campaigns (
    campaign_id,
    creator_id,
    status
  )
  values (
    p_campaign_id,
    v_creator_id,
    'accepted'
  )
  on conflict (campaign_id, creator_id) do nothing
  returning id, status into v_job_id, v_job_status;

  -- The unique creator/campaign index also protects against legacy or service-role
  -- writers that do not take the campaign row lock.
  if v_job_id is null then
    select j.id, j.status
      into v_job_id, v_job_status
      from public.creator_campaigns j
     where j.campaign_id = p_campaign_id
       and j.creator_id = v_creator_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Campaign acceptance could not be confirmed. Please retry.';
    end if;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'job_id', v_job_id,
      'status', v_job_status
    );
  end if;

  -- Do not disclose creator identity in advertiser notifications.
  if v_advertiser_id is not null and v_advertiser_id <> v_creator_id then
    insert into public.notifications (user_id, title, body, kind, link)
    values (
      v_advertiser_id,
      'A creator joined your campaign',
      'A creator accepted one of your campaigns. Review campaign activity in AdBridge.',
      'campaign_joined',
      '/advertiser/campaigns'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_accepted', false,
    'job_id', v_job_id,
    'status', v_job_status
  );
end;
$function$;

revoke all on function adbridge_private.accept_creator_campaign(uuid)
  from public, anon, authenticated;
grant execute on function adbridge_private.accept_creator_campaign(uuid)
  to authenticated;

create or replace function public.accept_creator_campaign(
  p_campaign_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select adbridge_private.accept_creator_campaign(p_campaign_id);
$wrapper$;

revoke all on function public.accept_creator_campaign(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_creator_campaign(uuid)
  to authenticated;

comment on function public.accept_creator_campaign(uuid) is
  'Accepts a campaign for the authenticated creator after server-side eligibility checks.';
