begin;

-- Admin-only, read-only lifecycle view. SECURITY INVOKER keeps the existing
-- campaigns and campaign_payments RLS policies in force for every row read.
create or replace function public.admin_campaign_lifecycle_overview(
  p_status text default 'all',
  p_limit integer default 200
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 200));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  ) then
    raise exception 'administrator access required'
      using errcode = '42501';
  end if;

  if p_status is null or p_status not in (
    'all', 'draft', 'funded', 'active', 'paused',
    'completed', 'closed', 'cancelled'
  ) then
    raise exception 'invalid campaign status filter'
      using errcode = '22023';
  end if;

  with campaign_financials as (
    select
      c.id,
      c.name,
      c.goal,
      c.platform,
      c.payment_method,
      c.payment_rate,
      greatest(coalesce(c.max_budget, 0), 0)::numeric(18,2) as max_budget,
      greatest(coalesce(c.funded_amount, 0), 0)::numeric(18,2) as funded_amount,
      c.desired_results,
      c.status,
      c.completion_reason,
      c.completed_at,
      c.created_at,
      coalesce(spend.committed_spend, 0)::numeric(18,2) as committed_spend,
      greatest(
        least(
          greatest(coalesce(c.max_budget, 0), 0),
          greatest(coalesce(c.funded_amount, 0), 0)
        ) - coalesce(spend.committed_spend, 0),
        0
      )::numeric(18,2) as remaining_funded_budget,
      case
        when lower(coalesce(c.payment_method, '')) in (
          'cpc', 'link_traffic', 'cpi', 'cpa', 'actions'
        ) then round(greatest(coalesce(c.payment_rate, 0), 0), 2)
        when lower(coalesce(c.payment_method, '')) = 'cpm' then 0.01::numeric
        else null::numeric
      end as required_next_result
    from public.campaigns c
    left join lateral (
      select coalesce(sum(cp.amount), 0)::numeric(18,2) as committed_spend
      from public.campaign_payments cp
      where cp.campaign_id = c.id
        and cp.type = 'creator_payment'
        and cp.status in ('pending', 'held', 'released')
    ) spend on true
  ),
  enriched as (
    select
      f.*,
      case
        when f.required_next_result is null then null
        when f.required_next_result <= 0 then false
        else f.remaining_funded_budget >= f.required_next_result
      end as can_fund_next_result,
      (
        f.status = 'active'
        and f.required_next_result is not null
        and (
          f.required_next_result <= 0
          or f.remaining_funded_budget < f.required_next_result
        )
      ) as needs_reconciliation
    from campaign_financials f
  ),
  summary as (
    select jsonb_build_object(
      'total', (count(*))::integer,
      'draft', (count(*) filter (where status = 'draft'))::integer,
      'funded', (count(*) filter (where status = 'funded'))::integer,
      'active', (count(*) filter (where status = 'active'))::integer,
      'paused', (count(*) filter (where status = 'paused'))::integer,
      'completed', (count(*) filter (where status = 'completed'))::integer,
      'closed', (count(*) filter (where status = 'closed'))::integer,
      'cancelled', (count(*) filter (where status = 'cancelled'))::integer,
      'needs_reconciliation', (count(*) filter (where needs_reconciliation))::integer
    ) as value
    from enriched
  ),
  selected_rows as (
    select *
    from enriched
    where p_status = 'all' or status = p_status
    order by created_at desc, id desc
    limit v_limit
  ),
  row_data as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'goal', goal,
            'platform', platform,
            'payment_method', payment_method,
            'payment_rate', payment_rate,
            'max_budget', max_budget,
            'funded_amount', funded_amount,
            'committed_spend', committed_spend,
            'remaining_funded_budget', remaining_funded_budget,
            'desired_results', desired_results,
            'status', status,
            'completion_reason', completion_reason,
            'completed_at', completed_at,
            'created_at', created_at,
            'required_next_result', required_next_result,
            'can_fund_next_result', can_fund_next_result,
            'needs_reconciliation', needs_reconciliation
          )
          order by created_at desc, id desc
        ),
        '[]'::jsonb
      ) as campaigns,
      count(*)::integer as returned_count
    from selected_rows
  ),
  filtered_count as (
    select count(*)::integer as total
    from enriched
    where p_status = 'all' or status = p_status
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', pg_catalog.now(),
    'summary', summary.value,
    'campaigns', row_data.campaigns,
    'truncated', filtered_count.total > row_data.returned_count
  )
  into v_result
  from summary
  cross join row_data
  cross join filtered_count;

  return v_result;
end;
$function$;

revoke all on function public.admin_campaign_lifecycle_overview(text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_campaign_lifecycle_overview(text, integer)
  to authenticated;

comment on function public.admin_campaign_lifecycle_overview(text, integer) is
  'Read-only admin campaign lifecycle and committed-budget overview. Uses invoker rights and existing RLS; does not expose advertiser or creator identifiers.';

commit;
