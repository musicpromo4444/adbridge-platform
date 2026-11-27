-- Run after applying 20261120175100_adbridge_advertiser_campaign_analytics_summary.
-- Read-only catalog assertions; no application data is modified.

do $$
declare
  v_rls_enabled boolean;
  v_policy_exists boolean;
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_advertiser_campaign_analytics'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      and not p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%'
  ) then
    raise exception 'Advertiser analytics RPC must exist as SECURITY INVOKER with an empty search_path';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.get_my_advertiser_campaign_analytics()', 'EXECUTE') then
    raise exception 'Anonymous users must not execute advertiser analytics';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.get_my_advertiser_campaign_analytics()', 'EXECUTE') then
    raise exception 'Authenticated users must be able to execute advertiser analytics';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.cpa_conversion_events', 'SELECT') then
    raise exception 'Authenticated users must not have table-wide conversion event access';
  end if;

  if not pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'campaign_id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'status', 'SELECT') then
    raise exception 'Authenticated users need the two narrow columns used for aggregate conversion counts';
  end if;

  if pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'creator_id', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'click_id', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'external_conversion_id', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.cpa_conversion_events', 'value', 'SELECT') then
    raise exception 'Sensitive conversion identifiers and values must remain unreadable to authenticated clients';
  end if;

  select c.relrowsecurity
    into v_rls_enabled
    from pg_catalog.pg_class c
   where c.oid = 'public.cpa_conversion_events'::regclass;

  if not coalesce(v_rls_enabled, false) then
    raise exception 'cpa_conversion_events must keep RLS enabled';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'cpa_conversion_events'
      and p.policyname = 'participants read cpa conversion events'
      and p.cmd = 'SELECT'
      and 'authenticated' = any(p.roles)
      and p.qual like '%advertiser_id%'
  ) into v_policy_exists;

  if not v_policy_exists then
    raise exception 'Existing advertiser-owned conversion RLS policy is required';
  end if;
end
$$;
