-- Read-only post-deployment assertions for the admin campaign lifecycle RPC.
do $$
declare
  v_security_definer boolean;
  v_config text;
  v_profiles_rls boolean;
  v_campaigns_rls boolean;
  v_payments_rls boolean;
begin
  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_campaign_lifecycle_overview'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_status text, p_limit integer';

  if not found then
    raise exception 'admin campaign lifecycle RPC is missing';
  end if;
  if v_security_definer then
    raise exception 'admin campaign lifecycle RPC must remain SECURITY INVOKER';
  end if;
  if v_config not like '%search_path=%' then
    raise exception 'admin campaign lifecycle RPC must pin an empty search_path';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_campaign_lifecycle_overview(text,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role must be able to call the admin RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.admin_campaign_lifecycle_overview(text,integer)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role must not be able to call the admin RPC';
  end if;

  select relrowsecurity into v_profiles_rls
  from pg_catalog.pg_class where oid = 'public.profiles'::regclass;
  select relrowsecurity into v_campaigns_rls
  from pg_catalog.pg_class where oid = 'public.campaigns'::regclass;
  select relrowsecurity into v_payments_rls
  from pg_catalog.pg_class where oid = 'public.campaign_payments'::regclass;

  if not coalesce(v_profiles_rls, false)
     or not coalesce(v_campaigns_rls, false)
     or not coalesce(v_payments_rls, false) then
    raise exception 'profile, campaign and campaign-payment RLS must remain enabled';
  end if;

  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('authenticated', 'public.campaigns', 'SELECT')
     or not has_table_privilege('authenticated', 'public.campaign_payments', 'SELECT') then
    raise exception 'invoker RPC requires existing authenticated SELECT grants';
  end if;
end
$$;
