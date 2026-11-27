create or replace function public.admin_prepare_paystack_campaign_refund(p_refund_payment_id uuid)
returns setof public.adbridge_paystack_refund_attempts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.campaign_payments%rowtype; c public.campaigns%rowtype; f record; remaining numeric; take_amount numeric; ref text; role_name text:=private.current_user_profile_role();
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into r from public.campaign_payments where id=p_refund_payment_id for update;
 if not found or r.type<>'refund' or r.status<>'pending' then raise exception 'Only pending refund requests can be processed' using errcode='55000'; end if;
 select * into c from public.campaigns where id=r.campaign_id for update;
 if not found or c.status<>'closed' then raise exception 'Campaign must be closed' using errcode='55000'; end if;
 if role_name<>'admin' and not(role_name='advertiser' and c.advertiser_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if exists(select 1 from public.adbridge_paystack_refund_attempts where refund_payment_id=r.id) then return query select * from public.adbridge_paystack_refund_attempts where refund_payment_id=r.id order by created_at,id; return; end if;
 remaining:=r.amount;
 for f in select id,amount,provider,provider_reference from public.campaign_payments where campaign_id=r.campaign_id and type='funding' and status in ('held','released') order by created_at,id for update loop
  if remaining<=0 then exit; end if;
  if f.provider<>'paystack' or nullif(trim(f.provider_reference),'') is null then raise exception 'Campaign includes non-Paystack funding; manual refund settlement is required' using errcode='55000'; end if;
  take_amount:=least(remaining,f.amount); ref:='abrf_'||replace(gen_random_uuid()::text,'-','');
  insert into public.adbridge_paystack_refund_attempts(refund_payment_id,funding_payment_id,amount,paystack_reference) values(r.id,f.id,take_amount,ref);
  remaining:=remaining-take_amount;
 end loop;
 if remaining>0 then raise exception 'Refund amount exceeds eligible Paystack funding' using errcode='55000'; end if;
 return query select * from public.adbridge_paystack_refund_attempts where refund_payment_id=r.id order by created_at,id;
end; $$;
create or replace function public.paystack_update_refund_attempt_internal(p_attempt_id uuid,p_status text,p_provider_refund_id text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype;
begin
 if p_status not in ('submitting','pending','processing','needs-attention','processed','failed','manual_review') then raise exception 'Invalid refund state' using errcode='22023'; end if;
 select * into a from public.adbridge_paystack_refund_attempts where id=p_attempt_id for update;
 if not found then raise exception 'Refund attempt not found' using errcode='P0002'; end if;
 if a.status in ('processed','failed') and a.status<>p_status then raise exception 'Terminal refund state cannot be changed' using errcode='55000'; end if;
 update public.adbridge_paystack_refund_attempts set status=p_status,provider_status=p_status,provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),last_error=case when p_error is null then null else left(p_error,1000) end,updated_at=now() where id=p_attempt_id;
 if p_status='processed' and not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_refund',provider_reference='paystack:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending';
 elsif p_status='failed' then update public.campaign_payments set provider='paystack_refund_attention' where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('ok',true,'attempt_id',p_attempt_id,'status',p_status);
end; $$;
create or replace function public.get_my_campaign_pending_refund(p_campaign_id uuid)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v uuid; role_name text:=private.current_user_profile_role();
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if role_name<>'admin' and not exists(select 1 from public.campaigns where id=p_campaign_id and advertiser_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 select id into v from public.campaign_payments where campaign_id=p_campaign_id and type='refund' and status='pending' order by created_at desc limit 1;
 return v;
end; $$;
revoke all on function public.paystack_update_refund_attempt_internal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.paystack_update_refund_attempt_internal(uuid,text,text,text) to service_role;
revoke all on function public.get_my_campaign_pending_refund(uuid) from public,anon;
grant execute on function public.get_my_campaign_pending_refund(uuid) to authenticated;