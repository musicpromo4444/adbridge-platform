-- Record an administrator-confirmed payout exactly once.
-- This records an external transfer reference supplied by an admin; it does not
-- independently verify settlement with a bank or payment provider.

alter table public.creator_withdrawals
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists payout_reference text;

create unique index if not exists creator_withdrawals_payout_reference_unique
  on public.creator_withdrawals (pg_catalog.lower(pg_catalog.btrim(payout_reference)))
  where payout_reference is not null;

-- Keep direct browser status changes closed even if earlier grants drift.
revoke update on table public.creator_withdrawals
  from public, anon, authenticated;

create or replace function adbridge_private.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_available numeric := 0;
  v_committed numeric := 0;
  v_requested numeric := p_amount;
  v_withdrawal_id uuid;
begin
  if v_creator_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_creator_id
       and p.role = 'creator'
  ) then
    raise exception using errcode = '42501', message = 'Creator access is required.';
  end if;

  if v_requested is null
     or v_requested::text in ('NaN', 'Infinity', '-Infinity')
     or v_requested <= 0
     or round(v_requested * 100) <> v_requested * 100 then
    raise exception using errcode = '22023', message = 'Enter a positive withdrawal amount in kobo increments.';
  end if;

  -- Serialize requests, reviews and payout recording for one creator.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_creator_id::text, 0)
  );

  select coalesce(sum(cp.amount), 0)::numeric
    into v_available
    from public.campaign_payments cp
   where cp.creator_id = v_creator_id
     and cp.type = 'creator_payment'
     and cp.status = 'released';

  -- Paid withdrawals are already spent, not available to request again.
  select coalesce(sum(cw.amount), 0)::numeric
    into v_committed
    from public.creator_withdrawals cw
   where cw.creator_id = v_creator_id
     and cw.status in ('pending', 'approved', 'paid');

  if v_requested > greatest(0::numeric, v_available - v_committed) then
    raise exception using errcode = 'P0001', message = 'Withdrawal exceeds available balance.';
  end if;

  insert into public.creator_withdrawals (creator_id, amount, status)
  values (v_creator_id, v_requested, 'pending')
  returning id into v_withdrawal_id;

  return pg_catalog.jsonb_build_object(
    'id', v_withdrawal_id,
    'amount', v_requested,
    'status', 'pending'
  );
end;
$function$;

revoke all on function adbridge_private.request_creator_withdrawal(numeric)
  from public, anon, authenticated;
grant execute on function adbridge_private.request_creator_withdrawal(numeric)
  to authenticated;

create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.request_creator_withdrawal(p_amount);
$function$;

revoke all on function public.request_creator_withdrawal(numeric)
  from public, anon, authenticated;
grant execute on function public.request_creator_withdrawal(numeric)
  to authenticated;

-- Preserve the existing RPC signature for older clients while correcting its
-- available balance to subtract payouts already recorded as paid.
create or replace function public.get_my_creator_earnings_summary()
returns table (
  released_earnings numeric,
  pending_earnings numeric,
  reserved_withdrawals numeric,
  available_balance numeric,
  withdrawal_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with actor as (
    select (select auth.uid()) as creator_id
     where (select auth.uid()) is not null
       and exists (
         select 1
           from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'creator'
       )
  ),
  payment_totals as (
    select
      coalesce(sum(cp.amount) filter (
        where cp.type = 'creator_payment' and cp.status = 'released'
      ), 0)::numeric as released_earnings,
      coalesce(sum(cp.amount) filter (
        where cp.type = 'creator_payment' and cp.status in ('pending', 'held', 'approved')
      ), 0)::numeric as pending_earnings
    from actor a
    left join public.campaign_payments cp on cp.creator_id = a.creator_id
  ),
  withdrawal_totals as (
    select
      coalesce(sum(cw.amount) filter (
        where cw.status in ('pending', 'approved')
      ), 0)::numeric as reserved_withdrawals,
      coalesce(sum(cw.amount) filter (
        where cw.status = 'paid'
      ), 0)::numeric as paid_withdrawals,
      count(cw.id)::bigint as withdrawal_count
    from actor a
    left join public.creator_withdrawals cw on cw.creator_id = a.creator_id
  )
  select
    pt.released_earnings,
    pt.pending_earnings,
    wt.reserved_withdrawals,
    greatest(
      0::numeric,
      pt.released_earnings - wt.reserved_withdrawals - wt.paid_withdrawals
    ) as available_balance,
    wt.withdrawal_count
  from actor
  cross join payment_totals pt
  cross join withdrawal_totals wt;
$function$;

revoke all on function public.get_my_creator_earnings_summary()
  from public, anon, authenticated;
grant execute on function public.get_my_creator_earnings_summary()
  to authenticated;

-- Versioned summary adds the paid total without changing the old RPC's return
-- type, allowing an orderly frontend rollout.
create or replace function public.get_my_creator_earnings_summary_v2()
returns table (
  released_earnings numeric,
  pending_earnings numeric,
  reserved_withdrawals numeric,
  paid_withdrawals numeric,
  available_balance numeric,
  withdrawal_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with summary as (
    select *
      from public.get_my_creator_earnings_summary()
  ),
  paid as (
    select coalesce(sum(cw.amount), 0)::numeric as paid_withdrawals
      from public.creator_withdrawals cw
     where cw.creator_id = (select auth.uid())
       and cw.status = 'paid'
  )
  select
    s.released_earnings,
    s.pending_earnings,
    s.reserved_withdrawals,
    p.paid_withdrawals,
    s.available_balance,
    s.withdrawal_count
  from summary s
  cross join paid p;
$function$;

revoke all on function public.get_my_creator_earnings_summary_v2()
  from public, anon, authenticated;
grant execute on function public.get_my_creator_earnings_summary_v2()
  to authenticated;

create or replace function adbridge_private.record_creator_withdrawal_payout(
  p_withdrawal_id uuid,
  p_payout_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_role text;
  v_creator_id uuid;
  v_amount numeric;
  v_current_status text;
  v_current_reference text;
  v_paid_at timestamptz;
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_payout_reference, '')), '');
begin
  if v_admin_id is null then
    raise exception using errcode = '28000', message = 'Sign in as an administrator to record a payout.';
  end if;

  select p.role
    into v_admin_role
    from public.profiles p
   where p.id = v_admin_id
   for share;

  if v_admin_role is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Administrator access required.';
  end if;

  if p_withdrawal_id is null then
    raise exception using errcode = '22023', message = 'Choose a valid withdrawal request.';
  end if;

  if v_reference is null
     or pg_catalog.char_length(v_reference) > 120
     or v_reference ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Enter a valid transfer reference of 1 to 120 characters.';
  end if;

  select w.creator_id, w.amount, w.status, w.payout_reference, w.paid_at
    into v_creator_id, v_amount, v_current_status, v_current_reference, v_paid_at
    from public.creator_withdrawals w
   where w.id = p_withdrawal_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Withdrawal request not found.';
  end if;

  -- A retry with the same reference is safe; a different reference cannot
  -- overwrite an already recorded payout.
  if v_current_status = 'paid' then
    if pg_catalog.lower(coalesce(v_current_reference, '')) = pg_catalog.lower(v_reference) then
      return pg_catalog.jsonb_build_object(
        'success', true,
        'withdrawal_id', p_withdrawal_id,
        'amount', v_amount,
        'status', 'paid',
        'payout_reference', v_current_reference,
        'paid_at', v_paid_at,
        'unchanged', true
      );
    end if;

    raise exception using errcode = 'P0001', message = 'This withdrawal already has a different recorded payout reference.';
  end if;

  if v_current_status is distinct from 'approved' then
    raise exception using errcode = 'P0001', message = 'Only approved withdrawals can be recorded as paid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_creator_id::text, 0)
  );

  update public.creator_withdrawals
     set status = 'paid',
         paid_by = v_admin_id,
         paid_at = pg_catalog.now(),
         payout_reference = v_reference
   where id = p_withdrawal_id
   returning paid_at into v_paid_at;

  insert into public.notifications (user_id, title, body, kind, link)
  values (
    v_creator_id,
    'Withdrawal payout recorded',
    'AdBridge has recorded your withdrawal as sent. Transfer reference: '
      || v_reference
      || '. This reflects administrator confirmation and is not independently verified by your bank or payment provider.',
    'creator_withdrawal_paid',
    '/creator/earnings'
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'amount', v_amount,
    'status', 'paid',
    'payout_reference', v_reference,
    'paid_at', v_paid_at,
    'unchanged', false
  );
end;
$function$;

revoke all on function adbridge_private.record_creator_withdrawal_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.record_creator_withdrawal_payout(uuid, text)
  to authenticated;

create or replace function public.record_creator_withdrawal_payout(
  p_withdrawal_id uuid,
  p_payout_reference text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.record_creator_withdrawal_payout(
    p_withdrawal_id,
    p_payout_reference
  );
$function$;

revoke all on function public.record_creator_withdrawal_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_creator_withdrawal_payout(uuid, text)
  to authenticated;

comment on function public.record_creator_withdrawal_payout(uuid, text) is
  'Allows an authenticated administrator to record an approved creator withdrawal as sent with a unique external reference. This is an administrator attestation, not bank-provider settlement verification.';
comment on function public.get_my_creator_earnings_summary_v2() is
  'Returns the authenticated creator own earnings, pending reservations, paid withdrawals and remaining available balance using caller RLS.';
