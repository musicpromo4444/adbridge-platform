-- Server-side click attribution and atomic creator-payment release.
-- Apply only after the AdBridge Supabase project is resumed and reviewed.

create table if not exists public.campaign_click_visitors (
  id uuid primary key default gen_random_uuid(),
  tracking_link_id uuid not null references public.tracking_links(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  click_count integer not null default 1 check (click_count > 0),
  referrer_origin text,
  constraint campaign_click_visitors_link_visitor_key unique (tracking_link_id, visitor_hash)
);

create index if not exists campaign_click_visitors_campaign_recent_idx
  on public.campaign_click_visitors (campaign_id, last_clicked_at desc);

alter table public.campaign_click_visitors enable row level security;
revoke all on table public.campaign_click_visitors from public, anon, authenticated;
grant all on table public.campaign_click_visitors to service_role;

create or replace function public.record_campaign_click(
  p_slug text,
  p_visitor_hash text,
  p_referrer_origin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_campaign record;
  v_link record;
  v_submission_status text;
  v_rows integer := 0;
  v_unique boolean := false;
  v_counted boolean := false;
  v_paid boolean := false;
  v_paid_count bigint := 0;
  v_payment jsonb;
  v_now timestamptz := pg_catalog.now();
begin
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{6,80}$' then
    raise exception using errcode = '22023', message = 'Invalid tracking slug';
  end if;
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid visitor hash';
  end if;

  -- Lock campaign before link so CPC and CPA postbacks use the same lock order.
  select tl.campaign_id
    into v_campaign_id
    from public.tracking_links tl
   where tl.slug = p_slug;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tracking link not found';
  end if;

  select c.status, c.payment_method, c.payment_rate, c.desired_results
    into v_campaign
    from public.campaigns c
   where c.id = v_campaign_id
   for update;

  if not found or v_campaign.status not in ('active', 'funded') then
    raise exception using errcode = 'P0002', message = 'Campaign is not active';
  end if;

  select tl.id, tl.campaign_id, tl.creator_id, tl.submission_id, tl.target_url
    into v_link
    from public.tracking_links tl
   where tl.slug = p_slug
     and tl.campaign_id = v_campaign_id
   for update;

  if not found or v_link.creator_id is null or v_link.submission_id is null then
    raise exception using errcode = 'P0002', message = 'Tracking link not found';
  end if;

  if v_link.target_url is null or v_link.target_url !~* '^https?://' then
    raise exception using errcode = 'P0002', message = 'Tracking destination unavailable';
  end if;

  select s.status
    into v_submission_status
    from public.submissions s
    join public.creator_campaigns j
      on j.id = s.creator_campaign_id
     and j.campaign_id = s.campaign_id
     and j.creator_id = s.creator_id
   where s.id = v_link.submission_id
     and s.campaign_id = v_link.campaign_id
     and s.creator_id = v_link.creator_id;

  if not found or v_submission_status not in ('waiting', 'approved') then
    raise exception using errcode = 'P0002', message = 'Submission is not eligible for tracking';
  end if;

  insert into public.campaign_click_visitors (
    tracking_link_id,
    campaign_id,
    visitor_hash,
    first_clicked_at,
    last_clicked_at,
    click_count,
    referrer_origin
  )
  values (
    v_link.id,
    v_link.campaign_id,
    p_visitor_hash,
    v_now,
    v_now,
    1,
    nullif(pg_catalog.left(p_referrer_origin, 512), '')
  )
  on conflict (tracking_link_id, visitor_hash) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    v_unique := true;
    v_counted := true;
  else
    update public.campaign_click_visitors
       set click_count = click_count + 1,
           last_clicked_at = v_now,
           referrer_origin = coalesce(
             nullif(pg_catalog.left(p_referrer_origin, 512), ''),
             referrer_origin
           )
     where tracking_link_id = v_link.id
       and visitor_hash = p_visitor_hash
       and last_clicked_at <= v_now - interval '30 seconds';

    get diagnostics v_rows = row_count;
    v_counted := v_rows = 1;
  end if;

  if v_counted and pg_catalog.lower(coalesce(v_campaign.payment_method, '')) in ('cpc', 'clicks', 'link_traffic') then
    select count(*)
      into v_paid_count
      from public.campaign_payments cp
     where cp.campaign_id = v_campaign_id
       and cp.type = 'creator_payment'
       and cp.status in ('released', 'approved', 'pending');

    if coalesce(v_campaign.desired_results, 0) > 0
       and v_paid_count >= v_campaign.desired_results then
      raise exception using errcode = 'P0001', message = 'Campaign click target already reached';
    end if;

    v_payment := public.release_creator_campaign_payment(
      v_campaign_id,
      v_link.creator_id,
      v_campaign.payment_rate,
      null,
      false,
      false,
      false
    );

    if coalesce((v_payment ->> 'paid')::boolean, false) is not true then
      raise exception using errcode = 'P0001', message = 'Campaign funding or remaining budget is unavailable';
    end if;
    v_paid := true;
  end if;

  if v_counted then
    update public.tracking_links tl
       set click_count = coalesce(tl.click_count, 0) + 1,
           unique_click_count = coalesce(tl.unique_click_count, 0)
             + case when v_unique then 1 else 0 end
     where tl.id = v_link.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'target_url', v_link.target_url,
    'counted', v_counted,
    'unique', v_unique,
    'paid', v_paid
  );
end;
$function$;

create or replace function public.release_creator_campaign_payment(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_amount numeric,
  p_submission_id uuid default null,
  p_allow_partial boolean default false,
  p_complete_submission boolean default false,
  p_notify_creator boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign record;
  v_funding numeric := 0;
  v_spent numeric := 0;
  v_remaining numeric := 0;
  v_payment_amount numeric := 0;
  v_existing_id uuid;
  v_creator_campaign_id uuid;
begin
  if p_campaign_id is null or p_creator_id is null or p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'A valid campaign, creator and payment amount are required';
  end if;
  if p_complete_submission and p_submission_id is null then
    raise exception using errcode = '22023', message = 'A submission is required to complete a campaign job';
  end if;

  select c.status, c.max_budget
    into v_campaign
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found';
  end if;
  if v_campaign.status not in ('active', 'funded') then
    return pg_catalog.jsonb_build_object('paid', false, 'duplicate', false, 'amount', 0, 'reason', 'campaign_not_active');
  end if;

  if p_submission_id is not null then
    select s.creator_campaign_id
      into v_creator_campaign_id
      from public.submissions s
     where s.id = p_submission_id
       and s.campaign_id = p_campaign_id
       and s.creator_id = p_creator_id
       and s.status in ('waiting', 'approved');

    if not found then
      raise exception using errcode = 'P0002', message = 'Submission does not belong to this creator and campaign';
    end if;
    if p_complete_submission and v_creator_campaign_id is null then
      raise exception using errcode = '22023', message = 'Submission is missing its campaign job';
    end if;

    select cp.id
      into v_existing_id
      from public.campaign_payments cp
     where cp.submission_id = p_submission_id
       and cp.type = 'creator_payment'
     limit 1;

    if found then
      if p_complete_submission then
        update public.submissions
           set status = 'approved',
               reviewed_at = pg_catalog.now()
         where id = p_submission_id
           and campaign_id = p_campaign_id
           and creator_id = p_creator_id;
        update public.creator_campaigns
           set status = 'completed'
         where id = v_creator_campaign_id
           and campaign_id = p_campaign_id
           and creator_id = p_creator_id;
      end if;
      return pg_catalog.jsonb_build_object('paid', true, 'duplicate', true, 'amount', 0);
    end if;
  end if;

  select coalesce(sum(cp.amount), 0)
    into v_funding
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.status = 'held';

  if v_funding <= 0 then
    return pg_catalog.jsonb_build_object('paid', false, 'duplicate', false, 'amount', 0, 'reason', 'funding_not_confirmed');
  end if;

  select coalesce(sum(cp.amount), 0)
    into v_spent
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'creator_payment'
     and cp.status in ('released', 'approved', 'pending');

  v_remaining := greatest(
    0,
    least(coalesce(v_campaign.max_budget, v_funding), v_funding) - v_spent
  );

  if v_remaining <= 0 then
    return pg_catalog.jsonb_build_object('paid', false, 'duplicate', false, 'amount', 0, 'reason', 'budget_exhausted');
  end if;

  if p_allow_partial then
    v_payment_amount := least(p_amount, v_remaining);
  else
    if p_amount > v_remaining then
      return pg_catalog.jsonb_build_object('paid', false, 'duplicate', false, 'amount', 0, 'reason', 'budget_exhausted');
    end if;
    v_payment_amount := p_amount;
  end if;

  if v_payment_amount <= 0 then
    return pg_catalog.jsonb_build_object('paid', false, 'duplicate', false, 'amount', 0, 'reason', 'budget_exhausted');
  end if;

  insert into public.campaign_payments (
    campaign_id,
    creator_id,
    submission_id,
    amount,
    type,
    status
  )
  values (
    p_campaign_id,
    p_creator_id,
    p_submission_id,
    v_payment_amount,
    'creator_payment',
    'released'
  );

  if p_complete_submission then
    update public.submissions
       set status = 'approved',
           reviewed_at = pg_catalog.now()
     where id = p_submission_id
       and campaign_id = p_campaign_id
       and creator_id = p_creator_id;
    update public.creator_campaigns
       set status = 'completed'
     where id = v_creator_campaign_id
       and campaign_id = p_campaign_id
       and creator_id = p_creator_id;
  end if;

  if p_notify_creator then
    insert into public.notifications (user_id, title, body, kind, link)
    values (
      p_creator_id,
      'Campaign earnings released',
      'A campaign payment has been added to your AdBridge balance.',
      'campaign_payment',
      '/creator/earnings'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'paid', true,
    'duplicate', false,
    'amount', v_payment_amount
  );
end;
$function$;

create or replace function public.record_cpa_conversion(
  p_campaign_id uuid,
  p_click_id text,
  p_external_conversion_id text,
  p_action_type text default 'conversion',
  p_value numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign record;
  v_link record;
  v_existing_id uuid;
  v_count bigint := 0;
  v_event_id uuid;
  v_payment jsonb;
begin
  if p_campaign_id is null
     or p_click_id is null
     or p_click_id !~ '^[A-Za-z0-9_-]{6,80}$'
     or p_external_conversion_id is null
     or pg_catalog.length(pg_catalog.btrim(p_external_conversion_id)) < 1
     or pg_catalog.length(p_external_conversion_id) > 200
     or p_external_conversion_id ~ '[[:cntrl:]]'
     or p_action_type is null
     or p_action_type !~ '^[A-Za-z0-9_.-]{1,50}$'
     or p_value is null
     or p_value < 0 then
    raise exception using errcode = '22023', message = 'Invalid conversion postback';
  end if;

  select c.status, c.payment_method, c.payment_rate, c.desired_results
    into v_campaign
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found or v_campaign.status not in ('active', 'funded') then
    raise exception using errcode = 'P0002', message = 'Campaign is not active';
  end if;
  if pg_catalog.lower(coalesce(v_campaign.payment_method, '')) not in ('actions', 'cpa', 'cpi') then
    raise exception using errcode = '22023', message = 'Campaign does not accept conversion postbacks';
  end if;

  select tl.id, tl.creator_id, tl.submission_id
    into v_link
    from public.tracking_links tl
   where tl.slug = p_click_id
     and tl.campaign_id = p_campaign_id
   for update;

  if not found or v_link.creator_id is null or v_link.submission_id is null then
    raise exception using errcode = 'P0002', message = 'AdBridge click attribution was not found';
  end if;

  if not exists (
    select 1
      from public.submissions s
      join public.creator_campaigns j
        on j.id = s.creator_campaign_id
       and j.campaign_id = s.campaign_id
       and j.creator_id = s.creator_id
     where s.id = v_link.submission_id
       and s.campaign_id = p_campaign_id
       and s.creator_id = v_link.creator_id
       and s.status in ('waiting', 'approved')
  ) then
    raise exception using errcode = 'P0002', message = 'Attributed creator submission is not eligible';
  end if;

  select e.id
    into v_existing_id
    from public.cpa_conversion_events e
   where e.campaign_id = p_campaign_id
     and e.external_conversion_id = p_external_conversion_id
   limit 1;

  if found then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select count(*)
    into v_count
    from public.cpa_conversion_events e
   where e.campaign_id = p_campaign_id
     and e.status = 'approved';

  if coalesce(v_campaign.desired_results, 0) > 0
     and v_count >= v_campaign.desired_results then
    raise exception using errcode = 'P0001', message = 'Campaign conversion target already reached';
  end if;

  v_payment := public.release_creator_campaign_payment(
    p_campaign_id,
    v_link.creator_id,
    v_campaign.payment_rate,
    null,
    false,
    false,
    true
  );

  if coalesce((v_payment ->> 'paid')::boolean, false) is not true then
    raise exception using errcode = 'P0001', message = 'Campaign funding or remaining budget is unavailable';
  end if;

  insert into public.cpa_conversion_events (
    campaign_id,
    creator_id,
    click_id,
    external_conversion_id,
    action_type,
    value,
    status
  )
  values (
    p_campaign_id,
    v_link.creator_id,
    p_click_id,
    p_external_conversion_id,
    p_action_type,
    p_value,
    'approved'
  )
  returning id into v_event_id;

  select count(*)
    into v_count
    from public.cpa_conversion_events e
   where e.campaign_id = p_campaign_id
     and e.status = 'approved';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_event_id,
    'conversions', v_count,
    'paid', true
  );
end;
$function$;

alter table public.cpa_conversion_events enable row level security;
revoke all on table public.cpa_conversion_events from public, anon, authenticated;
grant select on table public.cpa_conversion_events to authenticated;
grant all on table public.cpa_conversion_events to service_role;

drop policy if exists "participants read cpa conversion events" on public.cpa_conversion_events;
create policy "advertisers and admins read cpa conversion events"
  on public.cpa_conversion_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.campaigns c
       where c.id = cpa_conversion_events.campaign_id
         and c.advertiser_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.profiles p
       where p.id = (select auth.uid())
         and p.role = 'admin'
    )
  );

revoke all on function public.record_campaign_click(text, text, text) from public, anon, authenticated;
grant execute on function public.record_campaign_click(text, text, text) to service_role;

revoke all on function public.release_creator_campaign_payment(uuid, uuid, numeric, uuid, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.release_creator_campaign_payment(uuid, uuid, numeric, uuid, boolean, boolean, boolean) to service_role;

revoke all on function public.record_cpa_conversion(uuid, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.record_cpa_conversion(uuid, text, text, text, numeric) to service_role;

do $$
begin
  if pg_catalog.to_regprocedure('public.record_tracking_click(text,text,text,text)') is not null then
    execute 'revoke all on function public.record_tracking_click(text,text,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.record_tracking_click(text,text,text,text) to service_role';
  end if;
end;
$$;
