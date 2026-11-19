create or replace function public.release_cpm_submission_payment(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.submissions%rowtype;
  v_campaign public.campaigns%rowtype;
  v_requested numeric(18,2);
  v_spent numeric(18,2);
  v_budget numeric(18,2);
  v_amount numeric(18,2);
  v_existing uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select * into v_submission from public.submissions where id=p_submission_id;
  if not found then raise exception 'submission not found' using errcode='P0002'; end if;
  select * into v_campaign from public.campaigns where id=v_submission.campaign_id for update;
  if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
  if lower(coalesce(v_campaign.payment_method,'')) not in ('cpm','views') then
    raise exception 'submission is not a CPM campaign' using errcode='22023';
  end if;
  if coalesce(v_submission.target_metric,0)<=0 or coalesce(v_submission.current_metric,0)<v_submission.target_metric then
    return jsonb_build_object('ok',true,'paid',false,'reason','target_not_reached');
  end if;
  select id into v_existing from public.campaign_payments where submission_id=p_submission_id and type='creator_payment' limit 1;
  if found then return jsonb_build_object('ok',true,'paid',true,'duplicate',true,'payment_id',v_existing); end if;
  v_requested:=round(greatest(coalesce(v_campaign.payment_rate,0),0)*(v_submission.target_metric::numeric/1000),2);
  select coalesce(sum(amount),0) into v_spent from public.campaign_payments
   where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');
  v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
  v_amount:=least(v_requested,greatest(v_budget-v_spent,0));
  if v_amount<=0 then return jsonb_build_object('ok',true,'paid',false,'reason','budget_exhausted'); end if;
  insert into public.campaign_payments(campaign_id,creator_id,submission_id,amount,type,status)
  values(v_campaign.id,v_submission.creator_id,p_submission_id,v_amount,'creator_payment','released')
  on conflict do nothing returning id into v_existing;
  if v_existing is null then
    select id into v_existing from public.campaign_payments where submission_id=p_submission_id and type='creator_payment' limit 1;
    return jsonb_build_object('ok',true,'paid',true,'duplicate',true,'payment_id',v_existing);
  end if;
  update public.submissions set status='approved',reviewed_at=now() where id=p_submission_id;
  if v_submission.creator_campaign_id is not null then update public.creator_campaigns set status='completed' where id=v_submission.creator_campaign_id; end if;
  return jsonb_build_object('ok',true,'paid',true,'duplicate',false,'payment_id',v_existing,'amount',v_amount);
end;
$$;
revoke all on function public.release_cpm_submission_payment(uuid) from public,anon,authenticated;
grant execute on function public.release_cpm_submission_payment(uuid) to service_role;
