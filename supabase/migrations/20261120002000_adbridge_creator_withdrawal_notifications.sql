create table if not exists public.creator_withdrawal_notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 withdrawal_id uuid not null references public.creator_withdrawals(id) on delete cascade,
 event_id uuid not null unique references public.creator_withdrawal_events(id) on delete cascade,
 status text not null,title text not null,message text not null,read_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists creator_withdrawal_notifications_user_created_idx on public.creator_withdrawal_notifications(user_id,created_at desc);
alter table public.creator_withdrawal_notifications enable row level security;
revoke all on public.creator_withdrawal_notifications from anon,public;
grant select,update on public.creator_withdrawal_notifications to authenticated;
drop policy if exists creator_withdrawal_notifications_read_own on public.creator_withdrawal_notifications;
create policy creator_withdrawal_notifications_read_own on public.creator_withdrawal_notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists creator_withdrawal_notifications_update_own on public.creator_withdrawal_notifications;
create policy creator_withdrawal_notifications_update_own on public.creator_withdrawal_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create or replace function private.notify_creator_withdrawal_status()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp
as $function$
declare v_user uuid; v_title text; v_message text;
begin
 select creator_id into v_user from public.creator_withdrawals where id=new.withdrawal_id;
 if v_user is null then return new; end if;
 if new.new_status='approved' then v_title:='Withdrawal approved';v_message:='Your withdrawal request has been approved and is awaiting payment.';
 elsif new.new_status='rejected' then v_title:='Withdrawal request rejected';v_message:=coalesce(nullif(new.event_note,''),'Your withdrawal request was rejected. Contact AdBridge support if you need clarification.');
 elsif new.new_status='paid' then v_title:='Withdrawal paid';v_message:='Your withdrawal has been marked as paid. Transfer reference: '||coalesce(new.payment_reference,'not supplied')||'.';
 else v_title:='Withdrawal update';v_message:='Your withdrawal status changed to '||new.new_status||'.'; end if;
 insert into public.creator_withdrawal_notifications(user_id,withdrawal_id,event_id,status,title,message) values(v_user,new.withdrawal_id,new.id,new.new_status,v_title,v_message) on conflict(event_id) do nothing;
 return new;
end;$function$;
drop trigger if exists creator_withdrawal_status_notification on public.creator_withdrawal_events;
create trigger creator_withdrawal_status_notification after insert on public.creator_withdrawal_events for each row execute function private.notify_creator_withdrawal_status();
revoke all on function private.notify_creator_withdrawal_status() from public,anon,authenticated;