create or replace function private.guard_publisher_campaign_application_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_role := private.current_user_profile_role();
  if tg_op = 'INSERT' then
    if v_role <> 'publisher' or new.publisher_id <> auth.uid() then raise exception 'Only the owning publisher may submit an application' using errcode='42501'; end if;
    new.status := 'applied';
    new.applied_at := now();
    new.approved_at := null;
    new.completed_at := null;
    new.channel_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if v_role = 'publisher' then raise exception 'Publishers cannot change application review or delivery state' using errcode='42501'; end if;
    if v_role = 'advertiser' then
      if not exists(select 1 from public.campaigns c where c.id=old.campaign_id and c.advertiser_id=auth.uid()) then raise exception 'Not authorized to review this application' using errcode='42501'; end if;
      if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id or new.publisher_id is distinct from old.publisher_id or new.channel_id is distinct from old.channel_id or new.selected_property_id is distinct from old.selected_property_id or new.selected_platform is distinct from old.selected_platform or new.selected_format is distinct from old.selected_format then
        raise exception 'Advertisers may only update the application decision' using errcode='42501';
      end if;
      if new.status not in ('approved','rejected','changes_requested') then raise exception 'Invalid application decision' using errcode='22023'; end if;
      new.applied_at := old.applied_at;
      new.completed_at := old.completed_at;
      if new.status='approved' then new.approved_at := case when old.status='approved' then old.approved_at else now() end; else new.approved_at := null; end if;
      return new;
    end if;
    if v_role = 'admin' then
      if new.status='approved' then new.approved_at := case when old.status='approved' then old.approved_at else now() end; elsif new.status in ('rejected','changes_requested','applied') then new.approved_at := null; end if;
      return new;
    end if;
    raise exception 'Not authorized to update publisher applications' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function private.guard_publisher_campaign_application_status() from public,anon,authenticated;
drop trigger if exists guard_publisher_campaign_application_status on public.publisher_campaigns;
create trigger guard_publisher_campaign_application_status before insert or update on public.publisher_campaigns for each row execute function private.guard_publisher_campaign_application_status();