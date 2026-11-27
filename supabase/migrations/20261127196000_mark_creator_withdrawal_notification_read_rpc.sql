create or replace function public.mark_creator_withdrawal_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.creator_withdrawal_notifications set read_at=coalesce(read_at,now())
 where id=p_notification_id and user_id=v_user;
 return found;
end; $$;
revoke all on function public.mark_creator_withdrawal_notification_read(uuid) from public,anon;
grant execute on function public.mark_creator_withdrawal_notification_read(uuid) to authenticated;