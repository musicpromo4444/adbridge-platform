create or replace function public.confirm_campaign_funding(
  p_campaign_id uuid,
  p_provider_reference text,
  p_paid_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_payment public.campaign_payments%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_campaign_id is null or nullif(trim(p_provider_reference),'') is null or p_paid_amount is null or p_paid_amount<=0 then
    raise exception 'valid campaign, reference and paid amount are required' using errcode='22023';
  end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
  select * into v_payment from public.campaign_payments
   where campaign_id=p_campaign_id and provider='paystack' and provider_reference=trim(p_provider_reference) and type='funding'
   for update;
  if not found then raise exception 'pending payment reference does not belong to this campaign' using errcode='22023'; end if;
  if v_payment.status='held' then return jsonb_build_object('ok',true,'duplicate',true,'funded_amount',v_campaign.funded_amount); end if;
  if v_payment.status<>'pending' then raise exception 'payment is not pending' using errcode='55000'; end if;
  if round(p_paid_amount,2)<>round(v_payment.amount,2) or round(p_paid_amount,2)<>round(coalesce(v_campaign.max_budget,0),2) then
    raise exception 'verified payment amount does not match the campaign funding request' using errcode='22023';
  end if;
  update public.campaign_payments set status='held' where id=v_payment.id and status='pending';
  if not found then raise exception 'payment was already processed' using errcode='55000'; end if;
  update public.campaigns set status='funded',funded_amount=p_paid_amount,updated_at=now() where id=p_campaign_id;
  return jsonb_build_object('ok',true,'duplicate',false,'funded_amount',p_paid_amount,'payment_id',v_payment.id);
end;
$$;
revoke all on function public.confirm_campaign_funding(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.confirm_campaign_funding(uuid,text,numeric) to service_role;
