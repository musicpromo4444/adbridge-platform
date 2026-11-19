-- Read-only advertiser budget ledger summary.
-- The function mirrors the exact funding and committed-payout states used by
-- release_creator_campaign_payment and transition_campaign_status.
-- It exposes only aggregate balances for the authenticated advertiser.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;

create or replace function adbridge_private.get_my_campaign_budget_summary()
returns table (
  campaign_id uuid,
  campaign_name text,
  campaign_status text,
  max_budget numeric,
  held_funding numeric,
  committed_spend numeric,
  remaining_budget numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor_id;

  if coalesce(v_actor_role, '') <> 'advertiser' then
    raise exception using errcode = '42501', message = 'Advertiser access is required.';
  end if;

  return query
  select
    c.id,
    c.name::text,
    c.status::text,
    coalesce(c.max_budget, 0)::numeric,
    funding.amount,
    spend.amount,
    greatest(
      0::numeric,
      least(
        coalesce(c.max_budget, 0),
        funding.amount
      ) - spend.amount
    )::numeric
  from public.campaigns c
  cross join lateral (
    select coalesce(sum(cp.amount), 0)::numeric as amount
      from public.campaign_payments cp
     where cp.campaign_id = c.id
       and cp.type = 'funding'
       and cp.status = 'held'
  ) funding
  cross join lateral (
    select coalesce(sum(cp.amount), 0)::numeric as amount
      from public.campaign_payments cp
     where cp.campaign_id = c.id
       and cp.type = 'creator_payment'
       and cp.status in ('released', 'approved', 'pending')
  ) spend
  where c.advertiser_id = v_actor_id
  order by c.created_at desc;
end;
$function$;

revoke all on function adbridge_private.get_my_campaign_budget_summary()
  from public, anon, authenticated;
grant execute on function adbridge_private.get_my_campaign_budget_summary()
  to authenticated;

create or replace function public.get_my_campaign_budget_summary()
returns table (
  campaign_id uuid,
  campaign_name text,
  campaign_status text,
  max_budget numeric,
  held_funding numeric,
  committed_spend numeric,
  remaining_budget numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
    from adbridge_private.get_my_campaign_budget_summary();
$function$;

revoke all on function public.get_my_campaign_budget_summary()
  from public, anon, authenticated;
grant execute on function public.get_my_campaign_budget_summary()
  to authenticated;

comment on function public.get_my_campaign_budget_summary() is
  'Returns only the authenticated advertiser campaign funding, committed creator payments, and remaining funded budget. Amounts follow the payout ledger states used by AdBridge campaign lifecycle logic.';
