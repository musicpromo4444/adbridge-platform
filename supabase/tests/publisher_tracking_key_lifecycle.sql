-- Run after applying 20261120005000_adbridge_publisher_tracking_key_lifecycle.
-- Read-only catalog assertions; this script creates no fixtures and changes no data.
do $test$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publisher_tracking_secrets'
      and column_name = 'key_version'
  ) then raise exception 'publisher tracking key version column is missing'; end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'publisher_tracking_key_audit'
      and c.relrowsecurity is true
  ) then raise exception 'private publisher tracking key audit table or RLS is missing'; end if;

  if has_table_privilege('anon', 'private.publisher_tracking_key_audit', 'SELECT')
     or has_table_privilege('authenticated', 'private.publisher_tracking_key_audit', 'SELECT') then
    raise exception 'publisher key audit must not be readable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.rotate_publisher_tracking_key(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rotate_publisher_tracking_key(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.revoke_publisher_tracking_key(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.revoke_publisher_tracking_key(uuid,uuid)', 'EXECUTE') then
    raise exception 'publisher key lifecycle RPCs must not be callable by browser roles';
  end if;

  if not has_function_privilege('service_role', 'public.rotate_publisher_tracking_key(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.revoke_publisher_tracking_key(uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role is missing publisher key lifecycle RPC execution';
  end if;
end;
$test$;
