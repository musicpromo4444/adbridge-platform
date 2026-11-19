insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('withdrawal-payment-evidence','withdrawal-payment-evidence',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];
drop policy if exists adbridge_withdrawal_evidence_admin_insert on storage.objects;
create policy adbridge_withdrawal_evidence_admin_insert on storage.objects for insert to authenticated with check(bucket_id='withdrawal-payment-evidence' and private.current_user_profile_role()='admin' and exists(select 1 from public.creator_withdrawals w where w.id::text=split_part(name,'/',1)));
drop policy if exists adbridge_withdrawal_evidence_admin_read on storage.objects;
create policy adbridge_withdrawal_evidence_admin_read on storage.objects for select to authenticated using(bucket_id='withdrawal-payment-evidence' and private.current_user_profile_role()='admin');
drop policy if exists adbridge_withdrawal_evidence_admin_delete on storage.objects;
create policy adbridge_withdrawal_evidence_admin_delete on storage.objects for delete to authenticated using(bucket_id='withdrawal-payment-evidence' and private.current_user_profile_role()='admin');
create table if not exists private.creator_withdrawal_payment_evidence(id uuid primary key default gen_random_uuid(),withdrawal_id uuid not null references public.creator_withdrawals(id) on delete cascade,uploaded_by uuid not null references auth.users(id),storage_path text not null unique,file_name text not null,content_type text not null,size_bytes bigint not null check(size_bytes>0 and size_bytes<=5242880),created_at timestamptz not null default now());
alter table private.creator_withdrawal_payment_evidence enable row level security;
revoke all on private.creator_withdrawal_payment_evidence from public,anon,authenticated;
create or replace function public.admin_add_withdrawal_payment_evidence(p_withdrawal_id uuid,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path=public,private,storage,pg_temp as $function$
declare v_id uuid;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_withdrawal_id is null or p_storage_path is null or split_part(p_storage_path,'/',1)<>p_withdrawal_id::text then raise exception 'invalid evidence path' using errcode='22023'; end if;
 if p_file_name is null or length(trim(p_file_name))=0 or p_content_type not in ('application/pdf','image/jpeg','image/png','image/webp') or p_size_bytes<=0 or p_size_bytes>5242880 then raise exception 'unsupported evidence file' using errcode='22023'; end if;
 if not exists(select 1 from public.creator_withdrawals where id=p_withdrawal_id) then raise exception 'withdrawal not found' using errcode='P0002'; end if;
 if not exists(select 1 from storage.objects where bucket_id='withdrawal-payment-evidence' and name=p_storage_path) then raise exception 'uploaded storage object not found' using errcode='P0002'; end if;
 insert into private.creator_withdrawal_payment_evidence(withdrawal_id,uploaded_by,storage_path,file_name,content_type,size_bytes) values(p_withdrawal_id,auth.uid(),p_storage_path,left(p_file_name,255),p_content_type,p_size_bytes) returning id into v_id;
 return jsonb_build_object('ok',true,'evidence_id',v_id);
end;$function$;
revoke all on function public.admin_add_withdrawal_payment_evidence(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.admin_add_withdrawal_payment_evidence(uuid,text,text,text,bigint) to authenticated;
create or replace function public.admin_list_withdrawal_payment_evidence(p_withdrawal_id uuid) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_withdrawal_id is null then raise exception 'withdrawal id required' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows from(select id,withdrawal_id,storage_path,file_name,content_type,size_bytes,created_at,uploaded_by from private.creator_withdrawal_payment_evidence where withdrawal_id=p_withdrawal_id) x;
 return jsonb_build_object('ok',true,'evidence',v_rows);
end;$function$;
revoke all on function public.admin_list_withdrawal_payment_evidence(uuid) from public,anon;
grant execute on function public.admin_list_withdrawal_payment_evidence(uuid) to authenticated;