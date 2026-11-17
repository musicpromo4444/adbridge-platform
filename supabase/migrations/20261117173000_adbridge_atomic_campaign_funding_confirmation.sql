-- Paystack campaign funding: reserve one pending intent and confirm it atomically.
-- Edge Functions authenticate the advertiser and verify Paystack before using these
-- service-role-only RPCs. Browser roles cannot create or confirm funding rows.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to service_role;

create or replace function adbridge_private.prepare_campaign_funding(
  p_campaign_id uuid,
  p_advertiser_id uuid,
  p_new_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_campaign record;
  v_held_funding numeric := 0;
  v_amount_due numeric := 0;
  v_pending_count integer := 0;
  v_pending record;
  v_payment_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side funding access is required.';
  end if;

  if p_campaign_id is null
     or p_advertiser_id is null
     or p_new_reference is null
     or p_new_reference !~ '^adbridge_[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'A valid campaign funding request is required.';
  end if;

  select p.role into v_actor_role
    from public.profiles p
   where p.id = p_advertiser_id;

  if coalesce(v_actor_role, '') <> 'advertiser' then
    raise exception using errcode = '42501', message = 'Advertiser access is required.';
  end if;

  -- Serialize funding attempts for this campaign before reading its ledger.
  select c.advertiser_id, c.status, c.max_budget
    into v_campaign
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;

  if v_campaign.advertiser_id is distinct from p_advertiser_id then
    raise exception using errcode = '42501', message = 'You cannot fund another advertiser campaign.';
  end if;

  if coalesce(v_campaign.status, '') not in ('draft', 'funded') then
    raise exception using errcode = 'P0001', message = 'Only draft or funded campaigns can receive funding.';
  end if;

  if coalesce(v_campaign.max_budget, 0) <= 0 then
    raise exception using errcode = '22023', message = 'Campaign maximum budget must be greater than zero.';
  end if;

  if round(v_campaign.max_budget * 100) <> v_campaign.max_budget * 100 then
    raise exception using errcode = '22023', message = 'Campaign budget must use whole kobo increments.';
  end if;

  select coalesce(sum(cp.amount), 0)::numeric
    into v_held_funding
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.status = 'held';

  v_amount_due := greatest(
    0::numeric,
    round((v_campaign.max_budget - v_held_funding) * 100) / 100
  );

  if v_amount_due <= 0 then
    return pg_catalog.jsonb_build_object(
      'already_funded', true,
      'held_funding', v_held_funding,
      'amount_due', 0
    );
  end if;

  select count(*)::integer into v_pending_count
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.provider = 'paystack'
     and cp.status = 'pending';

  if v_pending_count > 1 then
    raise exception using errcode = 'P0001', message = 'Multiple pending funding attempts require support review.';
  end if;

  select cp.id, cp.amount, cp.provider_reference, cp.checkout_url
    into v_pending
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.provider = 'paystack'
     and cp.status = 'pending'
   order by cp.created_at desc
   limit 1
   for update;

  if found then
    if round(coalesce(v_pending.amount, 0) * 100) <> round(v_amount_due * 100)
       or coalesce(v_pending.provider_reference, '') !~ '^adbridge_[0-9a-f]{32}$' then
      raise exception using errcode = 'P0001', message = 'A previous funding attempt is still pending. Complete it or contact AdBridge support.';
    end if;

    return pg_catalog.jsonb_build_object(
      'already_funded', false,
      'payment_id', v_pending.id,
      'reference', v_pending.provider_reference,
      'amount', v_pending.amount,
      'checkout_url', v_pending.checkout_url,
      'reused', true
    );
  end if;

  insert into public.campaign_payments (
    campaign_id, amount, type, status, provider, provider_reference
  )
  values (
    p_campaign_id, v_amount_due, 'funding', 'pending', 'paystack', p_new_reference
  )
  returning id into v_payment_id;

  return pg_catalog.jsonb_build_object(
    'already_funded', false,
    'payment_id', v_payment_id,
    'reference', p_new_reference,
    'amount', v_amount_due,
    'checkout_url', null,
    'reused', false
  );
end;
$function$;

revoke all on function adbridge_private.prepare_campaign_funding(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.prepare_campaign_funding(uuid, uuid, text)
  to service_role;

create or replace function public.prepare_campaign_funding(
  p_campaign_id uuid,
  p_advertiser_id uuid,
  p_new_reference text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select adbridge_private.prepare_campaign_funding(p_campaign_id, p_advertiser_id, p_new_reference);
$wrapper$;

revoke all on function public.prepare_campaign_funding(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_campaign_funding(uuid, uuid, text)
  to service_role;

create or replace function adbridge_private.confirm_campaign_funding(
  p_campaign_id uuid,
  p_payment_id uuid,
  p_advertiser_id uuid,
  p_provider_reference text,
  p_paid_amount numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_campaign record;
  v_payment record;
  v_held_funding numeric := 0;
  v_funded boolean := false;
  v_remaining numeric := 0;
  v_result_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side funding confirmation is required.';
  end if;

  if p_campaign_id is null
     or p_payment_id is null
     or p_advertiser_id is null
     or p_provider_reference is null
     or p_provider_reference !~ '^adbridge_[0-9a-f]{32}$'
     or p_paid_amount is null
     or p_paid_amount <= 0
     or round(p_paid_amount * 100) <> p_paid_amount * 100
     or pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency, ''))) <> 'NGN' then
    raise exception using errcode = '22023', message = 'The verified Paystack payment details are invalid.';
  end if;

  select p.role into v_actor_role
    from public.profiles p
   where p.id = p_advertiser_id;

  if coalesce(v_actor_role, '') <> 'advertiser' then
    raise exception using errcode = '42501', message = 'Advertiser access is required.';
  end if;

  -- Match the campaign-then-payment lock order used by intent preparation and lifecycle changes.
  select c.advertiser_id, c.status, c.max_budget
    into v_campaign
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;

  if v_campaign.advertiser_id is distinct from p_advertiser_id then
    raise exception using errcode = '42501', message = 'You cannot confirm funding for another advertiser campaign.';
  end if;

  select cp.amount, cp.type, cp.status, cp.provider, cp.provider_reference
    into v_payment
    from public.campaign_payments cp
   where cp.id = p_payment_id
     and cp.campaign_id = p_campaign_id
   for update;

  if not found
     or v_payment.type <> 'funding'
     or v_payment.provider <> 'paystack'
     or v_payment.provider_reference is distinct from p_provider_reference then
    raise exception using errcode = 'P0002', message = 'The matching campaign funding attempt was not found.';
  end if;

  if round(coalesce(v_payment.amount, 0) * 100) <> round(p_paid_amount * 100) then
    raise exception using errcode = 'P0001', message = 'The Paystack amount does not match the saved funding attempt.';
  end if;

  if v_payment.status = 'held' then
    select coalesce(sum(cp.amount), 0)::numeric into v_held_funding
      from public.campaign_payments cp
     where cp.campaign_id = p_campaign_id
       and cp.type = 'funding'
       and cp.status = 'held';

    v_funded := v_held_funding >= coalesce(v_campaign.max_budget, 0);
    v_remaining := greatest(0::numeric, coalesce(v_campaign.max_budget, 0) - v_held_funding);

    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'funded', v_funded,
      'status', v_campaign.status,
      'amount', v_payment.amount,
      'held_funding', v_held_funding,
      'remaining_to_fund', v_remaining
    );
  end if;

  if v_payment.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'This funding attempt is no longer pending.';
  end if;

  if coalesce(v_campaign.status, '') not in ('draft', 'funded') then
    raise exception using errcode = 'P0001', message = 'This campaign can no longer receive funding.';
  end if;

  select coalesce(sum(cp.amount), 0)::numeric into v_held_funding
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.status = 'held';

  if v_held_funding + v_payment.amount > coalesce(v_campaign.max_budget, 0) then
    raise exception using errcode = 'P0001', message = 'This payment exceeds the campaign funding still required. Contact AdBridge support for reconciliation.';
  end if;

  update public.campaign_payments
     set status = 'held'
   where id = p_payment_id
     and campaign_id = p_campaign_id
     and status = 'pending';

  select coalesce(sum(cp.amount), 0)::numeric into v_held_funding
    from public.campaign_payments cp
   where cp.campaign_id = p_campaign_id
     and cp.type = 'funding'
     and cp.status = 'held';

  v_funded := v_held_funding >= coalesce(v_campaign.max_budget, 0);
  v_remaining := greatest(0::numeric, coalesce(v_campaign.max_budget, 0) - v_held_funding);
  v_result_status := case
    when v_funded and v_campaign.status = 'draft' then 'funded'
    else v_campaign.status
  end;

  update public.campaigns
     set funded_amount = v_held_funding,
         status = v_result_status,
         updated_at = pg_catalog.now()
   where id = p_campaign_id;

  insert into public.notifications (user_id, title, body, kind, link)
  values (
    p_advertiser_id,
    case when v_funded then 'Campaign funding confirmed' else 'Campaign payment recorded' end,
    case
      when v_funded then 'Your campaign budget is fully funded. You can review and activate the campaign from your dashboard.'
      else 'Your payment is confirmed and held. The campaign remains a draft until its full budget is funded.'
    end,
    'campaign_funding',
    '/advertiser/campaigns'
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'funded', v_funded,
    'status', v_result_status,
    'amount', p_paid_amount,
    'held_funding', v_held_funding,
    'remaining_to_fund', v_remaining
  );
end;
$function$;

revoke all on function adbridge_private.confirm_campaign_funding(uuid, uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.confirm_campaign_funding(uuid, uuid, uuid, text, numeric, text)
  to service_role;

create or replace function public.confirm_campaign_funding(
  p_campaign_id uuid,
  p_payment_id uuid,
  p_advertiser_id uuid,
  p_provider_reference text,
  p_paid_amount numeric,
  p_currency text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select adbridge_private.confirm_campaign_funding(
    p_campaign_id, p_payment_id, p_advertiser_id, p_provider_reference, p_paid_amount, p_currency
  );
$wrapper$;

revoke all on function public.confirm_campaign_funding(uuid, uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.confirm_campaign_funding(uuid, uuid, uuid, text, numeric, text)
  to service_role;

comment on function public.prepare_campaign_funding(uuid, uuid, text) is
  'Serializes campaign funding attempts and creates or reuses one pending Paystack funding intent for the authenticated Edge Function.';
comment on function public.confirm_campaign_funding(uuid, uuid, uuid, text, numeric, text) is
  'Atomically records a verified Paystack funding attempt as held, updates campaign funded amount/status, and notifies its advertiser.';
