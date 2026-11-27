-- Read-only post-deployment assertions for the official social-post URL guard.
do $$
declare
  v_function oid := 'public.enforce_official_social_submission_host()'::regprocedure;
  v_trigger_count integer;
  v_is_definer boolean;
  v_config text[];
begin
  select count(*) into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'submissions'
    and t.tgname = 'submissions_official_social_host_guard'
    and not t.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'expected exactly one official social URL guard trigger';
  end if;

  select p.prosecdef, p.proconfig
    into v_is_definer, v_config
  from pg_proc p
  where p.oid = v_function;

  if v_is_definer is distinct from false then
    raise exception 'URL guard trigger function must remain SECURITY INVOKER';
  end if;

  if not coalesce(v_config @> array['search_path='], false) then
    raise exception 'URL guard trigger function must pin an empty search_path';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE')
     or has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'trigger function must not be directly executable by API roles';
  end if;
end;
$$;
