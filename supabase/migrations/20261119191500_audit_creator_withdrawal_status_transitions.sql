create table if not exists public.creator_withdrawal_events (
 id uuid primary key default gen_random_uuid(),
 withdrawal_id uuid not null references public.creator_withdrawals(id) on delete restrict,
 actor_id uuid references public.profiles(id) on delete set null,
 previous_status text,
 new_status text not null,
 amount numeric not null,
 created_at timestamptz not null default now()
);
create index if not exists creator_withdrawal_events_withdrawal_idx
 on public.creator_withdrawal_events(withdrawal_id,created_at desc);
alter table public.creator_withdrawal_events enable row level security;
revoke all on public.creator_withdrawal_events from anon,authenticated;

create or replace function public.log_creator_withdrawal_status_change()
returns trigger
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
begin
 if new.status is distinct from old.status then
  insert into public.creator_withdrawal_events(withdrawal_id,actor_id,previous_status,new_status,amount)
  values(new.id,auth.uid(),old.status,new.status,new.amount);
 end if;
 return new;
end;
$function$;

drop trigger if exists creator_withdrawal_status_audit on public.creator_withdrawals;
create trigger creator_withdrawal_status_audit
after update of status on public.creator_withdrawals
for each row execute function public.log_creator_withdrawal_status_change();

create or replace function public.admin_list_withdrawal_events(p_withdrawal_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then
  raise exception 'administrator access required' using errcode='42501';
 end if;
 if p_withdrawal_id is null then raise exception 'withdrawal id is required' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
 into v_rows from (
  select id,withdrawal_id,actor_id,previous_status,new_status,amount,created_at
  from public.creator_withdrawal_events
  where withdrawal_id=p_withdrawal_id
  order by created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250))
 ) x;
 return jsonb_build_object('ok',true,'events',v_rows);
end;
$function$;

revoke all on function public.log_creator_withdrawal_status_change() from public,anon,authenticated;
revoke all on function public.admin_list_withdrawal_events(uuid,integer) from public,anon;
grant execute on function public.admin_list_withdrawal_events(uuid,integer) to authenticated;
