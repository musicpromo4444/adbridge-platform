-- Run after 202611270009_restrict_anonymous_security_definer_entrypoints.sql.
do $$
begin
  if has_function_privilege('anon', 'public.admin_launch_readiness()', 'EXECUTE') then
    raise exception 'anon must not execute admin_launch_readiness';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_launch_readiness()', 'EXECUTE') then
    raise exception 'authenticated admins must retain admin_launch_readiness access';
  end if;

  if has_function_privilege('anon', 'public.admin_review_creator_verification(uuid,text,text)', 'EXECUTE') then
    raise exception 'anon must not execute admin_review_creator_verification';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_review_creator_verification(uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated admins must retain creator verification review access';
  end if;

  if has_function_privilege('anon', 'public.sync_approved_publisher_ad_placement()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_approved_publisher_ad_placement()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.sync_approved_publisher_ad_placement()', 'EXECUTE') then
    raise exception 'publisher placement trigger function must not be executable through API roles';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'publisher_campaigns'
      and t.tgname = 'publisher_application_ad_placement_sync'
      and not t.tgisinternal
  ) then
    raise exception 'publisher application placement trigger must remain installed';
  end if;
end;
$$;
