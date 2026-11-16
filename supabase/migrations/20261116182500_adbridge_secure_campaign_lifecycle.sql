-- Keep campaign status changes server-owned.
-- Advertisers may edit campaign details, but status transitions are validated here.
-- This migration is version-controlled only; apply after the AdBridge project is resumed.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;

-- Remove broad browser UPDATE access, then restore only the campaign-detail columns
-- used by the advertiser edit screen. In particular, status is never client-writable.
revoke update on table public.campaigns from public, anon, authenticated;
revoke update (status) on table public.campaigns from public, anon, authenticated;
grant update (
  name,
  goal,
  instructions,
  platform,
  payment_method,
  payment_rate,
  max_budget,
  desired_results,
  updated_at
) on table public.campaigns to authenticated;

create or replace function adbridge_private.transition_campaign_status(
  p_campaign_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_advertiser_id uuid;
  v_current_status text;
  v_target_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_target_status, '')));
  v_max_budget numeric := 0;
  v_funded_amount numeric := 0;
  v_confirmed_funding numeric := 0;
  v_spent numeric := 0;
  v_available_budget numeric := 0;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Sign in before changing a campaign.';
  end if;

  if p_campaign_id is null then
    raise exception using errcode = '22023', message = 'A campaign is required.';
  end if;

  if v_target_status not in ('active', 'paused', 'closed') then
    raise exception using errcode = '22023', message = 'Choose a supported campaign status.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor_id
   for share;

  if not found or v_actor_role not in ('advertiser', 'admin') then
    raise exception using errcode = '42501', message = 'Advertiser or administrator access is required.';
  end if;

  -- Serialize lifecycle changes with payment confirmation and creator acceptance.
  select c.advertiser_id, c.status, c.max_budget, c.funded_amount
    into v_advertiser_id, v_current_status, v_max_budget, v_funded_amount
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;

  if v_actor_role <> 'admin' and v_advertiser_id <> v_actor_id then
    raise exception using errcode = '42501', message = 'You cannot change another advertiser campaign.';
  end if;

  if v_current_status = v_target_status then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'status', v_current_status,
      'available_budget', 0,
      'unchanged', true
    );
  end if;

  if v_current_status = 'closed' then
    raise exception using errcode = 'P0001', message = 'Closed campaigns cannot be reopened.';
  end if;

  if v_target_status = 'paused' and v_current_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Only an active campaign can be paused.';
  end if;

  if v_target_status = 'closed'
     and v_current_status not in ('draft', 'funded', 'active', 'paused') then
    raise exception using errcode = 'P0001', message = 'This campaign cannot be closed from its current state.';
  end if;

  if v_target_status = 'active' then
    if v_current_status not in ('funded', 'paused') then
      raise exception using errcode = 'P0001', message = 'Only a funded or paused campaign can be activated.';
    end if;

    select coalesce(sum(cp.amount), 0)
      into v_confirmed_funding
      from public.campaign_payments cp
     where cp.campaign_id = p_campaign_id
       and cp.type = 'funding'
       and cp.status = 'held';

    select coalesce(sum(cp.amount), 0)
      into v_spent
      from public.campaign_payments cp
     where cp.campaign_id = p_campaign_id
       and cp.type = 'creator_payment'
       and cp.status in ('released', 'approved', 'pending');

    v_available_budget := greatest(
      0,
      least(coalesce(v_max_budget, 0), v_confirmed_funding) - v_spent
    );

    if coalesce(v_max_budget, 0) <= 0
       or coalesce(v_funded_amount, 0) < v_max_budget
       or v_confirmed_funding < v_max_budget then
      raise exception using errcode = 'P0001', message = 'The campaign needs confirmed funding for its full budget before activation.';
    end if;

    if v_available_budget <= 0 then
      raise exception using errcode = 'P0001', message = 'The campaign has no unspent funded budget remaining.';
    end if;
  end if;

  update public.campaigns
     set status = v_target_status,
         updated_at = pg_catalog.now()
   where id = p_campaign_id;

  -- Existing creators are notified without disclosing advertiser or creator identities.
  if v_target_status in ('paused', 'closed') then
    insert into public.notifications (user_id, title, body, kind, link)
    select distinct
      j.creator_id,
      case when v_target_status = 'paused' then 'Campaign paused' else 'Campaign closed' end,
      case
        when v_target_status = 'paused'
          then 'A campaign you joined has been paused. Check your AdBridge work dashboard for updates.'
        else 'A campaign you joined has been closed. Check your AdBridge work dashboard for updates.'
      end,
      'campaign_lifecycle',
      '/creator/campaigns'
    from public.creator_campaigns j
    where j.campaign_id = p_campaign_id
      and j.creator_id is not null
      and j.status in ('accepted', 'in_progress', 'submitted', 'changes_requested');
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'status', v_target_status,
    'available_budget', v_available_budget,
    'unchanged', false
  );
end;
$function$;

revoke all on function adbridge_private.transition_campaign_status(uuid, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.transition_campaign_status(uuid, text)
  to authenticated;

create or replace function public.transition_campaign_status(
  p_campaign_id uuid,
  p_target_status text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select adbridge_private.transition_campaign_status(p_campaign_id, p_target_status);
$wrapper$;

revoke all on function public.transition_campaign_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_campaign_status(uuid, text)
  to authenticated;

comment on function public.transition_campaign_status(uuid, text) is
  'Validates campaign lifecycle changes for the authenticated advertiser or administrator.';
