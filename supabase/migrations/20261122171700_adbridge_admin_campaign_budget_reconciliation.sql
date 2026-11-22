begin;

-- Reconcile a campaign whose activity triggers may have been missed during an
-- earlier deployment. This is an explicit admin operation, not a client write.
create or replace function public.admin_reconcile_campaign_budget(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign public.campaigns%rowtype;
  v_spent numeric(18,2);
  v_budget numeric(18,2);
  v_remaining numeric(18,2);
  v_required numeric(18,2);
  v_exhausted boolean := false;
  v_changed boolean := false;
  v_status text;
  v_completion_reason text;
  v_completed_at timestamptz;
  v_outcome text;
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

  if p_campaign_id is null then
    raise exception 'campaign id is required'
      using errcode = '22023';
  end if;

  select c.*
    into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id
  for update;

  if not found then
    raise exception 'campaign not found'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(cp.amount), 0)::numeric(18,2)
    into v_spent
  from public.campaign_payments cp
  where cp.campaign_id = v_campaign.id
    and cp.type = 'creator_payment'
    and cp.status in ('pending', 'held', 'released');

  v_budget := least(
    greatest(coalesce(v_campaign.max_budget, 0), 0),
    greatest(coalesce(v_campaign.funded_amount, 0), 0)
  )::numeric(18,2);
  v_remaining := greatest(v_budget - v_spent, 0)::numeric(18,2);

  if lower(coalesce(v_campaign.payment_method, '')) in (
    'cpc', 'link_traffic', 'cpi', 'cpa', 'actions'
  ) then
    v_required := round(greatest(coalesce(v_campaign.payment_rate, 0), 0), 2);
  elsif lower(coalesce(v_campaign.payment_method, '')) = 'cpm' then
    v_required := 0.01;
  else
    v_required := null;
  end if;

  v_status := v_campaign.status;
  v_completion_reason := v_campaign.completion_reason;
  v_completed_at := v_campaign.completed_at;

  if v_campaign.status not in ('funded', 'active') then
    v_outcome := 'not_eligible';
  elsif v_required is null then
    v_outcome := 'unsupported_payment_method';
  else
    v_exhausted := v_required <= 0 or v_remaining < v_required;

    if v_exhausted then
      update public.campaigns c
      set status = 'completed',
          completion_reason = 'budget_exhausted',
          completed_at = coalesce(c.completed_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      where c.id = v_campaign.id
        and c.status in ('funded', 'active')
      returning c.status, c.completion_reason, c.completed_at
        into v_status, v_completion_reason, v_completed_at;

      v_changed := found;
      v_outcome := case when v_changed then 'completed' else 'not_eligible' end;
    else
      v_outcome := 'not_exhausted';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'outcome', v_outcome,
    'status', v_status,
    'completion_reason', v_completion_reason,
    'completed_at', v_completed_at,
    'remaining_funded_budget', v_remaining,
    'required_next_result', v_required
  );
end;
$function$;

revoke all on function public.admin_reconcile_campaign_budget(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_reconcile_campaign_budget(uuid)
  to authenticated;

comment on function public.admin_reconcile_campaign_budget(uuid) is
  'Admin-only, row-locked reconciliation. Completes a funded or active campaign only when the committed creator-payment ledger proves that its remaining funded budget cannot cover the next payable result. Existing completion triggers send owner-scoped notifications.';

commit;
