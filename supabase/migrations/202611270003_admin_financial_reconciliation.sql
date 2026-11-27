-- Admin financial reconciliation: compare campaign funding and payout ledger
-- totals against the campaign balance fields, and surface withdrawals separately.
create or replace function public.admin_financial_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_campaigns jsonb;
  v_issues jsonb;
  v_totals jsonb;
  v_result jsonb;
begin
  if private.current_user_profile_role() <> 'admin' then
    raise exception 'administrator access required' using errcode='42501';
  end if;

  with ledger as (
    select
      c.id as campaign_id,
      c.name as campaign_name,
      c.status as campaign_status,
      coalesce(c.max_budget,0)::numeric(18,2) as max_budget,
      coalesce(c.funded_amount,0)::numeric(18,2) as campaign_funded_amount,
      coalesce(sum(cp.amount) filter (
        where cp.type='funding' and cp.status in ('held','released')
      ),0)::numeric(18,2) as ledger_funding,
      coalesce(sum(cp.amount) filter (
        where cp.type='refund' and cp.status in ('held','released')
      ),0)::numeric(18,2) as ledger_refunds,
      coalesce(sum(cp.amount) filter (
        where cp.type='creator_payment' and cp.status in ('pending','held','released')
      ),0)::numeric(18,2) as committed_creator_payouts,
      coalesce(sum(cp.amount) filter (
        where cp.type='creator_payment' and cp.status='released'
      ),0)::numeric(18,2) as released_creator_payouts,
      count(cp.id) filter (where cp.type='funding') as funding_records,
      count(cp.id) filter (where cp.type='creator_payment') as payout_records
    from public.campaigns c
    left join public.campaign_payments cp on cp.campaign_id=c.id
    group by c.id,c.name,c.status,c.max_budget,c.funded_amount
  ),
  evaluated as (
    select *,
      round(ledger_funding-campaign_funded_amount,2) as funding_difference,
      round(committed_creator_payouts-greatest(least(max_budget,campaign_funded_amount)-ledger_refunds,0),2) as payout_overrun
    from ledger
  )
  select
    coalesce(jsonb_agg(to_jsonb(e) order by e.campaign_name),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'campaign_id',e.campaign_id,
      'campaign_name',e.campaign_name,
      'campaign_status',e.campaign_status,
      'issue',case
        when abs(e.funding_difference)>0.01 then 'funding_ledger_mismatch'
        else 'creator_payouts_exceed_net_funded_budget'
      end,
      'funding_difference',e.funding_difference,
      'payout_overrun',e.payout_overrun,
      'ledger_funding',e.ledger_funding,
      'campaign_funded_amount',e.campaign_funded_amount,
      'committed_creator_payouts',e.committed_creator_payouts,
      'max_budget',e.max_budget
    ) order by e.campaign_name) filter (
      where abs(e.funding_difference)>0.01 or e.payout_overrun>0.01
    ),'[]'::jsonb)
  into v_campaigns,v_issues
  from evaluated e;

  select jsonb_build_object(
    'campaign_count',(select count(*) from public.campaigns),
    'funding_ledger_total',coalesce(sum(amount) filter(where type='funding' and status in ('held','released')),0),
    'refund_ledger_total',coalesce(sum(amount) filter(where type='refund' and status in ('held','released')),0),
    'creator_payouts_committed',coalesce(sum(amount) filter(where type='creator_payment' and status in ('pending','held','released')),0),
    'creator_payouts_released',coalesce(sum(amount) filter(where type='creator_payment' and status='released'),0),
    'creator_payouts_held',coalesce(sum(amount) filter(where type='creator_payment' and status in ('pending','held')),0),
    'pending_funding',coalesce(sum(amount) filter(where type='funding' and status='pending'),0),
    'withdrawals_pending',(select coalesce(sum(amount),0) from public.creator_withdrawals where status='pending'),
    'withdrawals_approved',(select coalesce(sum(amount),0) from public.creator_withdrawals where status='approved'),
    'withdrawals_paid',(select coalesce(sum(amount),0) from public.creator_withdrawals where status='paid'),
    'withdrawals_rejected',(select coalesce(sum(amount),0) from public.creator_withdrawals where status='rejected'),
    'withdrawal_count',(select count(*) from public.creator_withdrawals)
  )
  into v_totals
  from public.campaign_payments;

  v_result:=jsonb_build_object(
    'generated_at',now(),
    'totals',coalesce(v_totals,'{}'::jsonb),
    'campaigns',coalesce(v_campaigns,'[]'::jsonb),
    'issues',coalesce(v_issues,'[]'::jsonb),
    'issue_count',jsonb_array_length(coalesce(v_issues,'[]'::jsonb))
  );
  return v_result;
end;
$$;

revoke all on function public.admin_financial_reconciliation() from public, anon;
grant execute on function public.admin_financial_reconciliation() to authenticated;
