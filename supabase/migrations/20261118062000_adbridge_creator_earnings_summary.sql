-- Creator earnings are summarized by the database, and withdrawal requests stay atomic.
-- The public RPCs are SECURITY INVOKER wrappers; the narrow write operation lives
-- in the non-exposed adbridge_private schema and always derives the creator from auth.uid().

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;

create or replace function adbridge_private.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := auth.uid();
  v_available numeric := 0;
  v_reserved numeric := 0;
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

  -- Serialize requests per creator so two simultaneous requests cannot reserve
  -- the same released earnings.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_creator_id::text, 0)
  );

  select coalesce(sum(cp.amount), 0)::numeric
    into v_available
    from public.campaign_payments cp
   where cp.creator_id = v_creator_id
     and cp.type = 'creator_payment'
     and cp.status = 'released';

  select coalesce(sum(cw.amount), 0)::numeric
    into v_reserved
    from public.creator_withdrawals cw
   where cw.creator_id = v_creator_id
     and cw.status in ('pending', 'approved');

  if v_requested > greatest(0::numeric, v_available - v_reserved) then
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
      coalesce(
        sum(cp.amount) filter (
          where cp.type = 'creator_payment'
            and cp.status = 'released'
        ),
        0
      )::numeric as released_earnings,
      coalesce(
        sum(cp.amount) filter (
          where cp.type = 'creator_payment'
            and cp.status in ('pending', 'held', 'approved')
        ),
        0
      )::numeric as pending_earnings
    from actor a
    left join public.campaign_payments cp
      on cp.creator_id = a.creator_id
  ),
  withdrawal_totals as (
    select
      coalesce(
        sum(cw.amount) filter (where cw.status in ('pending', 'approved')),
        0
      )::numeric as reserved_withdrawals,
      count(cw.id)::bigint as withdrawal_count
    from actor a
    left join public.creator_withdrawals cw
      on cw.creator_id = a.creator_id
  )
  select
    pt.released_earnings,
    pt.pending_earnings,
    wt.reserved_withdrawals,
    greatest(0::numeric, pt.released_earnings - wt.reserved_withdrawals) as available_balance,
    wt.withdrawal_count
  from actor
  cross join payment_totals pt
  cross join withdrawal_totals wt;
$function$;

revoke all on function public.get_my_creator_earnings_summary()
  from public, anon, authenticated;
grant execute on function public.get_my_creator_earnings_summary()
  to authenticated;

comment on function public.get_my_creator_earnings_summary() is
  'Returns the authenticated creator own earnings and reserved-withdrawal aggregates using caller RLS.';
comment on function public.request_creator_withdrawal(numeric) is
  'Requests a creator withdrawal through a SECURITY INVOKER wrapper and a narrowly scoped private atomic operation.';
