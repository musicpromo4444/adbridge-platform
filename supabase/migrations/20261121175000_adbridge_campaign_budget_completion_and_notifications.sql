begin;

alter table public.campaigns
  add column if not exists completion_reason text,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.campaigns'::regclass
      and conname = 'campaigns_completion_reason_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_completion_reason_check
      check (
        completion_reason is null
        or completion_reason in ('budget_exhausted', 'target_reached', 'manual')
      );
  end if;
end
$$;

create table if not exists public.campaign_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null default 'campaign_completed'
    check (event_type = 'campaign_completed'),
  completion_reason text not null
    check (completion_reason in ('budget_exhausted', 'target_reached', 'manual')),
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaign_lifecycle_notifications_once
    unique (campaign_id, user_id, event_type)
);

create index if not exists campaign_lifecycle_notifications_user_created_idx
  on public.campaign_lifecycle_notifications (user_id, created_at desc);

alter table public.campaign_lifecycle_notifications enable row level security;

revoke all on table public.campaign_lifecycle_notifications from public, anon, authenticated;
grant select on table public.campaign_lifecycle_notifications to authenticated;
grant update (read_at) on table public.campaign_lifecycle_notifications to authenticated;

drop policy if exists campaign_lifecycle_notifications_owner_select
  on public.campaign_lifecycle_notifications;
create policy campaign_lifecycle_notifications_owner_select
  on public.campaign_lifecycle_notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campaign_lifecycle_notifications_owner_read_state
  on public.campaign_lifecycle_notifications;
create policy campaign_lifecycle_notifications_owner_read_state
  on public.campaign_lifecycle_notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function private.capture_campaign_completion_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spent numeric(18,2);
  v_budget numeric(18,2);
  v_remaining numeric(18,2);
  v_required numeric(18,2);
begin
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'completed campaigns cannot be reactivated or reopened'
      using errcode = '55000';
  end if;

  if new.status = 'active' and old.status <> 'active' then
    select coalesce(sum(cp.amount), 0)::numeric(18,2)
      into v_spent
    from public.campaign_payments cp
    where cp.campaign_id = new.id
      and cp.type = 'creator_payment'
      and cp.status in ('pending', 'held', 'released');

    v_budget := least(
      greatest(coalesce(new.max_budget, 0), 0),
      greatest(coalesce(new.funded_amount, 0), 0)
    );
    v_remaining := greatest(v_budget - v_spent, 0);

    if lower(coalesce(new.payment_method, '')) in ('cpc', 'link_traffic', 'cpi', 'cpa', 'actions') then
      v_required := round(greatest(coalesce(new.payment_rate, 0), 0), 2);
      if v_required <= 0 or v_remaining < v_required then
        raise exception 'campaign budget cannot fund another payable result; create a new campaign to continue'
          using errcode = '55000';
      end if;
    elsif v_remaining < 0.01 then
      raise exception 'campaign budget is exhausted; create a new campaign to continue'
        using errcode = '55000';
    end if;
  end if;

  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    if new.completion_reason is null then
      if coalesce(auth.role(), '') = 'service_role' then
        new.completion_reason := 'target_reached';
      else
        new.completion_reason := 'manual';
      end if;
    end if;
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completion_reason := null;
  end if;

  return new;
end;
$$;

create or replace function private.reconcile_campaign_budget_completion(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_spent numeric(18,2);
  v_budget numeric(18,2);
  v_remaining numeric(18,2);
  v_required numeric(18,2);
  v_exhausted boolean := false;
begin
  if p_campaign_id is null then
    return;
  end if;

  select *
    into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found or v_campaign.status not in ('funded', 'active') then
    return;
  end if;

  select coalesce(sum(cp.amount), 0)::numeric(18,2)
    into v_spent
  from public.campaign_payments cp
  where cp.campaign_id = p_campaign_id
    and cp.type = 'creator_payment'
    and cp.status in ('pending', 'held', 'released');

  v_budget := least(
    greatest(coalesce(v_campaign.max_budget, 0), 0),
    greatest(coalesce(v_campaign.funded_amount, 0), 0)
  );
  v_remaining := greatest(v_budget - v_spent, 0);

  if lower(coalesce(v_campaign.payment_method, '')) in ('cpc', 'link_traffic', 'cpi', 'cpa', 'actions') then
    v_required := round(greatest(coalesce(v_campaign.payment_rate, 0), 0), 2);
    v_exhausted := v_required <= 0 or v_remaining < v_required;
  else
    -- CPM can consume a final partial amount; it is exhausted only when no
    -- cent remains for another verified metric payout.
    v_exhausted := v_remaining < 0.01;
  end if;

  if not v_exhausted then
    return;
  end if;

  update public.campaigns
  set status = 'completed',
      completion_reason = 'budget_exhausted',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_campaign_id
    and status in ('funded', 'active');
end;
$$;

create or replace function private.reconcile_campaign_budget_after_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := pg_catalog.to_jsonb(new);
  v_campaign_id uuid;
begin
  if tg_table_name = 'tracking_clicks' then
    select tl.campaign_id
      into v_campaign_id
    from public.tracking_links tl
    where tl.id = nullif(v_row ->> 'tracking_link_id', '')::uuid;
  else
    v_campaign_id := nullif(v_row ->> 'campaign_id', '')::uuid;
  end if;

  if v_campaign_id is not null then
    perform private.reconcile_campaign_budget_completion(v_campaign_id);
  end if;

  return new;
end;
$$;

create or replace function private.notify_campaign_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := coalesce(new.completion_reason, 'manual');
  v_reason_text text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  v_reason_text := case v_reason
    when 'budget_exhausted' then 'the funded budget cannot cover another payable result'
    when 'target_reached' then 'the configured campaign target has been reached'
    else 'an administrator marked the campaign complete'
  end;

  with recipients as (
    select new.advertiser_id as user_id, 'advertiser'::text as audience
    where new.advertiser_id is not null
    union all
    select cc.creator_id, 'creator'::text
    from public.creator_campaigns cc
    where cc.campaign_id = new.id
      and cc.creator_id is not null
    union all
    select pc.publisher_id, 'publisher'::text
    from public.publisher_campaigns pc
    where pc.campaign_id = new.id
      and pc.publisher_id is not null
  ),
  deduplicated_recipients as (
    select user_id, min(audience) as audience
    from recipients
    group by user_id
  )
  insert into public.campaign_lifecycle_notifications (
    user_id,
    campaign_id,
    event_type,
    completion_reason,
    title,
    message
  )
  select
    recipient.user_id,
    new.id,
    'campaign_completed',
    v_reason,
    case
      when recipient.audience = 'advertiser' then 'Campaign completed'
      else 'Campaign delivery ended'
    end,
    case
      when recipient.audience = 'advertiser' then
        'Your campaign "' || new.name || '" ended because ' || v_reason_text || '. Review the campaign results and budget.'
      else
        'Campaign "' || new.name || '" ended because ' || v_reason_text || '. This does not confirm payment; check your AdBridge earnings ledger for any released amount.'
    end
  from deduplicated_recipients recipient
  on conflict (campaign_id, user_id, event_type) do nothing;

  return new;
end;
$$;

revoke all on function private.capture_campaign_completion_metadata()
  from public, anon, authenticated, service_role;
revoke all on function private.reconcile_campaign_budget_completion(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.reconcile_campaign_budget_after_activity()
  from public, anon, authenticated, service_role;
revoke all on function private.notify_campaign_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists campaign_completion_metadata_guard on public.campaigns;
create trigger campaign_completion_metadata_guard
before update of status on public.campaigns
for each row
execute function private.capture_campaign_completion_metadata();

drop trigger if exists campaign_completion_notification on public.campaigns;
create trigger campaign_completion_notification
after update of status on public.campaigns
for each row
execute function private.notify_campaign_completion();

drop trigger if exists campaign_budget_after_creator_payment on public.campaign_payments;
create trigger campaign_budget_after_creator_payment
after insert or update of amount, status, type on public.campaign_payments
for each row
when (new.type = 'creator_payment' and new.status in ('pending', 'held', 'released'))
execute function private.reconcile_campaign_budget_after_activity();

drop trigger if exists campaign_budget_after_tracking_click on public.tracking_clicks;
create trigger campaign_budget_after_tracking_click
after insert on public.tracking_clicks
for each row
execute function private.reconcile_campaign_budget_after_activity();

drop trigger if exists campaign_budget_after_conversion on public.cpa_conversion_events;
create trigger campaign_budget_after_conversion
after insert on public.cpa_conversion_events
for each row
execute function private.reconcile_campaign_budget_after_activity();

drop trigger if exists campaign_budget_after_publisher_event on public.ad_placement_events;
create trigger campaign_budget_after_publisher_event
after insert on public.ad_placement_events
for each row
execute function private.reconcile_campaign_budget_after_activity();

drop trigger if exists campaign_budget_after_verified_submission_metric on public.submissions;
create trigger campaign_budget_after_verified_submission_metric
after update of current_metric, metric_status on public.submissions
for each row
execute function private.reconcile_campaign_budget_after_activity();

comment on column public.campaigns.completion_reason is
  'Why campaign delivery became terminal: budget_exhausted, target_reached, or manual.';
comment on column public.campaigns.completed_at is
  'Timestamp when campaign status first changed to completed.';
comment on table public.campaign_lifecycle_notifications is
  'Owner-scoped campaign completion notices; payment status must be checked in the earnings ledger.';

commit;
