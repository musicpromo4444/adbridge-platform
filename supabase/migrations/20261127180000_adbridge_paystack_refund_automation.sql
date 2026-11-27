create table if not exists public.adbridge_paystack_refund_attempts (
 id uuid primary key default gen_random_uuid(),
 refund_payment_id uuid not null references public.campaign_payments(id) on delete restrict,
 funding_payment_id uuid not null references public.campaign_payments(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0), currency text not null default 'NGN' check(currency='NGN'),
 paystack_reference text not null unique,
 status text not null default 'queued' check(status in ('queued','submitting','pending','processing','needs-attention','processed','failed','manual_review')),
 provider_refund_id text, provider_status text, last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(refund_payment_id,funding_payment_id)
);
alter table public.adbridge_paystack_refund_attempts enable row level security;
revoke all on public.adbridge_paystack_refund_attempts from public,anon,authenticated;
create or replace function public.admin_prepare_paystack_campaign_refund(p_refund_payment_id uuid)
returns setof public.adbridge_paystack_refund_attempts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.campaign_payments%rowtype; c public.campaigns%rowtype; f record; remaining numeric; take_amount numeric; ref text;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into r from public.campaign_payments where id=p_refund_payment_id for update;
 if not found or r.type<>'refund' or r.status<>'pending' then raise exception 'Only pending refund requests can be processed' using errcode='55000'; end if;
 select * into c from public.campaigns where id=r.campaign_id for update;
 if not found or c.status<>'closed' then raise exception 'Campaign must be closed' using errcode='55000'; end if;
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
create or replace function public.admin_update_paystack_refund_attempt(p_attempt_id uuid,p_status text,p_provider_refund_id text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_status not in ('submitting','pending','processing','needs-attention','processed','failed','manual_review') then raise exception 'Invalid refund state' using errcode='22023'; end if;
 select * into a from public.adbridge_paystack_refund_attempts where id=p_attempt_id for update;
 if not found then raise exception 'Refund attempt not found' using errcode='P0002'; end if;
 if a.status in ('processed','failed') and a.status<>p_status then raise exception 'Terminal refund state cannot be changed' using errcode='55000'; end if;
 update public.adbridge_paystack_refund_attempts set status=p_status,provider_status=p_status,provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),last_error=case when p_error is null then null else left(p_error,1000) end,updated_at=now() where id=p_attempt_id;
 if p_status='processed' and not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_refund',provider_reference='paystack:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending';
 elsif p_status='failed' then update public.campaign_payments set provider='paystack_refund_attention' where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('ok',true,'attempt_id',p_attempt_id,'status',p_status);
end; $$;
create or replace function public.paystack_reconcile_refund_webhook(p_reference text,p_status text,p_provider_refund_id text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype;
begin
 select * into a from public.adbridge_paystack_refund_attempts where paystack_reference=p_reference for update;
 if not found then return jsonb_build_object('matched',false); end if;
 if p_status not in ('pending','processing','needs-attention','processed','failed') then return jsonb_build_object('matched',true,'ignored',true); end if;
 update public.adbridge_paystack_refund_attempts set status=p_status,provider_status=p_status,provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),updated_at=now() where id=a.id and status not in ('processed','failed');
 if p_status='processed' and not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_refund',provider_reference='paystack:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending';
 elsif p_status='failed' then update public.campaign_payments set provider='paystack_refund_attention' where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('matched',true,'attempt_id',a.id);
end; $$;
revoke all on function public.admin_prepare_paystack_campaign_refund(uuid) from public,anon;
revoke all on function public.admin_update_paystack_refund_attempt(uuid,text,text,text) from public,anon;
revoke all on function public.paystack_reconcile_refund_webhook(text,text,text) from public,anon,authenticated;
grant execute on function public.admin_prepare_paystack_campaign_refund(uuid) to authenticated;
grant execute on function public.admin_update_paystack_refund_attempt(uuid,text,text,text) to authenticated;
grant execute on function public.paystack_reconcile_refund_webhook(text,text,text) to service_role;