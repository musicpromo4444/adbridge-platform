begin;

-- Manual CPM evidence is submitted by the creator, but only the server may
-- record an administrator's decision or update the verified submission metric.
alter table public.metric_verifications
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.metric_verifications'::regclass
      and conname = 'metric_verifications_review_note_length'
  ) then
    alter table public.metric_verifications
      add constraint metric_verifications_review_note_length
      check (review_note is null or pg_catalog.char_length(review_note) <= 500);
  end if;
end
$$;

-- Keep creator evidence submission, but remove browser control over review fields.
revoke all on table public.metric_verifications from public, anon, authenticated;
grant select (id, submission_id, evidence_url, claimed_metric, note, status, review_note, created_at, reviewed_at)
  on table public.metric_verifications to authenticated;
grant insert (submission_id, evidence_url, claimed_metric, note)
  on table public.metric_verifications to authenticated;

drop policy if exists "admin update metric verifications" on public.metric_verifications;

create index if not exists metric_verifications_pending_review_idx
  on public.metric_verifications (created_at desc)
  where status = 'pending';

-- Keep this inbox compatible with the campaign-completion migration. If that
-- migration has already been applied, this is an additive, idempotent upgrade.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null default 'general',
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  completion_reason text,
  reference_id uuid references public.metric_verifications(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists campaign_id uuid,
  add column if not exists completion_reason text,
  add column if not exists reference_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_campaign_id_fkey'
  ) then
    alter table public.notifications
      add constraint notifications_campaign_id_fkey
      foreign key (campaign_id) references public.campaigns(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_reference_id_fkey'
  ) then
    alter table public.notifications
      add constraint notifications_reference_id_fkey
      foreign key (reference_id) references public.metric_verifications(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_completion_reason_check'
  ) then
    alter table public.notifications
      add constraint notifications_completion_reason_check
      check (
        completion_reason is null
        or completion_reason in ('budget_exhausted', 'target_reached', 'manual')
      );
  end if;
end
$$;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create unique index if not exists notifications_metric_verification_once
  on public.notifications (user_id, reference_id, kind)
  where kind = 'metric_verification' and reference_id is not null;

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;
grant insert on table public.notifications to service_role;

drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select
  on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notifications_owner_read_state on public.notifications;
create policy notifications_owner_read_state
  on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Creator-facing submission RPC. It is invoker-security so the existing
-- participant SELECT and creator INSERT RLS policies remain in force.
create or replace function public.submit_manual_metric_evidence(
  p_submission_id uuid,
  p_claimed_metric bigint,
  p_evidence_url text,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.submissions%rowtype;
  v_campaign public.campaigns%rowtype;
  v_existing_id uuid;
  v_existing_metric bigint;
  v_existing_url text;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'creator'
  ) then
    raise exception 'creator account required' using errcode = '42501';
  end if;

  if p_submission_id is null
     or p_claimed_metric is null
     or p_claimed_metric < 0
     or p_evidence_url is null
     or pg_catalog.length(pg_catalog.btrim(p_evidence_url)) > 2048
     or pg_catalog.btrim(p_evidence_url) !~* '^https?://'
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'valid submission, non-negative whole metric, HTTP(S) evidence URL and note up to 500 characters are required'
      using errcode = '22023';
  end if;

  -- Serialize pending evidence creation for a single submission without
  -- requiring the creator to have UPDATE privileges on the submission row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submission_id::text, 0)
  );

  select s.*
    into v_submission
  from public.submissions s
  where s.id = p_submission_id
    and s.creator_id = (select auth.uid());

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'waiting' then
    raise exception 'submission is not awaiting metric review' using errcode = '55000';
  end if;

  select c.*
    into v_campaign
  from public.campaigns c
  where c.id = v_submission.campaign_id;

  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_campaign.payment_method, '')) not in ('cpm', 'views') then
    raise exception 'manual view evidence is only available for CPM campaigns' using errcode = '22023';
  end if;

  if coalesce(v_submission.target_metric, 0) <= 0 then
    raise exception 'campaign has no valid view target' using errcode = '22023';
  end if;

  select mv.id, mv.claimed_metric, mv.evidence_url
    into v_existing_id, v_existing_metric, v_existing_url
  from public.metric_verifications mv
  where mv.submission_id = p_submission_id
    and mv.status = 'pending'
  order by mv.created_at desc
  limit 1;

  if found then
    if v_existing_metric = p_claimed_metric
       and v_existing_url = pg_catalog.btrim(p_evidence_url) then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'id', v_existing_id,
        'status', 'pending',
        'duplicate', true
      );
    end if;

    raise exception 'manual metric evidence is already awaiting review'
      using errcode = '55000';
  end if;

  insert into public.metric_verifications (
    submission_id, claimed_metric, evidence_url, note
  )
  values (
    p_submission_id,
    p_claimed_metric,
    pg_catalog.btrim(p_evidence_url),
    nullif(pg_catalog.btrim(coalesce(p_note, '')), '')
  )
  returning id into v_new_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'status', 'pending',
    'duplicate', false
  );
end;
$function$;

revoke all on function public.submit_manual_metric_evidence(uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_manual_metric_evidence(uuid, bigint, text, text)
  to authenticated;

-- Server-only review RPC. The Edge Function validates the caller's JWT and
-- admin role; this function independently validates the reviewed_by profile
-- and only accepts service-role invocation.
create or replace function public.admin_review_manual_metric_verification(
  p_metric_verification_id uuid,
  p_decision text,
  p_reviewed_by uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_metric public.metric_verifications%rowtype;
  v_submission public.submissions%rowtype;
  v_campaign public.campaigns%rowtype;
  v_payout jsonb;
  v_body text;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_review_note text := nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_metric_verification_id is null
     or v_decision not in ('approved', 'rejected')
     or p_reviewed_by is null
     or pg_catalog.length(coalesce(v_review_note, '')) > 500
     or (v_decision = 'rejected' and v_review_note is null) then
    raise exception 'valid metric review decision, administrator and review note are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_reviewed_by and p.role = 'admin'
  ) then
    raise exception 'administrator account required' using errcode = '42501';
  end if;

  select mv.*
    into v_metric
  from public.metric_verifications mv
  where mv.id = p_metric_verification_id
  for update;

  if not found then
    raise exception 'metric evidence not found' using errcode = 'P0002';
  end if;

  -- An approved retry may safely retry a previously budget-blocked CPM payout.
  -- The payout RPC is itself idempotent and locks the submission and campaign.
  if v_metric.status <> 'pending' then
    if v_metric.status = v_decision then
      if v_decision = 'approved' then
        v_payout := public.release_cpm_submission_payment(v_metric.submission_id);
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'decision', v_metric.status,
        'payout', v_payout
      );
    end if;
    raise exception 'metric evidence has already received a different decision'
      using errcode = '55000';
  end if;

  select s.*
    into v_submission
  from public.submissions s
  where s.id = v_metric.submission_id
  for update;

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  select c.*
    into v_campaign
  from public.campaigns c
  where c.id = v_submission.campaign_id
  for update;

  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'waiting'
     or lower(coalesce(v_campaign.payment_method, '')) not in ('cpm', 'views')
     or v_metric.claimed_metric is null
     or v_metric.claimed_metric < 0
     or coalesce(v_submission.target_metric, 0) <= 0 then
    raise exception 'submission is not eligible for manual CPM metric review'
      using errcode = '55000';
  end if;

  if v_decision = 'approved' then
    update public.metric_verifications
    set status = 'approved',
        reviewed_at = pg_catalog.now(),
        reviewed_by = p_reviewed_by,
        review_note = v_review_note
    where id = v_metric.id;

    update public.submissions
    set current_metric = greatest(coalesce(current_metric, 0), v_metric.claimed_metric),
        metric_status = 'verified',
        metric_verified_at = coalesce(metric_verified_at, pg_catalog.now())
    where id = v_submission.id;

    -- This existing server-only function performs the budget-gated, idempotent
    -- creator payout. It returns an explicit reason when no payout is released.
    v_payout := public.release_cpm_submission_payment(v_submission.id);

    if coalesce((v_payout ->> 'paid')::boolean, false) then
      v_body := 'AdBridge accepted your manual view evidence. Any eligible CPM payment is recorded separately in your earnings ledger.';
    else
      v_body := 'AdBridge accepted your manual view evidence. No payment was released in this review; CPM payment remains subject to the verified target and available funded budget. Check your earnings ledger for released amounts.';
    end if;
  else
    update public.metric_verifications
    set status = 'rejected',
        reviewed_at = pg_catalog.now(),
        reviewed_by = p_reviewed_by,
        review_note = v_review_note
    where id = v_metric.id;

    v_payout := pg_catalog.jsonb_build_object(
      'paid', false,
      'reason', 'metric_evidence_rejected'
    );
    v_body := 'AdBridge could not accept your manual view evidence. Review the feedback and submit corrected evidence if the campaign is still awaiting review. Reason: ' || v_review_note;
  end if;

  insert into public.notifications (
    user_id, campaign_id, kind, title, body, link, reference_id
  )
  values (
    v_submission.creator_id,
    v_submission.campaign_id,
    'metric_verification',
    case when v_decision = 'approved'
      then 'Manual metric evidence accepted'
      else 'Manual metric evidence needs attention'
    end,
    v_body,
    '/creator/work',
    v_metric.id
  )
  on conflict do nothing;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'decision', v_decision,
    'payout', v_payout
  );
end;
$function$;

revoke all on function public.admin_review_manual_metric_verification(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_review_manual_metric_verification(uuid, text, uuid, text)
  to service_role;

comment on function public.submit_manual_metric_evidence(uuid, bigint, text, text) is
  'Creator-owned, invoker-security submission of public manual CPM metric evidence. Only the evidence fields are insertable by authenticated creators.';
comment on function public.admin_review_manual_metric_verification(uuid, text, uuid, text) is
  'Service-role-only, invoker-security atomic administrator decision for manual CPM evidence, including verified metric update, budget-gated payout and creator notification.';

commit;
