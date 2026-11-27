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
  if coalesce(f.provider,'')<>'paystack' or nullif(trim(f.provider_reference),'') is null then raise exception 'Campaign includes non-Paystack funding; manual refund settlement is required' using errcode='55000'; end if;
  take_amount:=least(remaining,f.amount); ref:='abrf_'||replace(gen_random_uuid()::text,'-','');
  insert into public.adbridge_paystack_refund_attempts(refund_payment_id,funding_payment_id,amount,paystack_reference) values(r.id,f.id,take_amount,ref);
  remaining:=remaining-take_amount;
 end loop;
 if remaining>0 then raise exception 'Refund amount exceeds eligible Paystack funding' using errcode='55000'; end if;
 return query select * from public.adbridge_paystack_refund_attempts where refund_payment_id=r.id order by created_at,id;
end; $$;