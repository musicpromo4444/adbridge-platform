-- Read-only post-deployment assertions for admin budget reconciliation.
do $$
declare
  v_security_definer boolean;
  v_config text;
  v_definition text;
begin
  select
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ','), ''),
    pg_catalog.pg_get_functiondef(p.oid)
  into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_reconcile_campaign_budget'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_campaign_id uuid';

  if not found then
    raise exception 'admin budget reconciliation RPC is missing';
  end if;
  if not v_security_definer then
    raise exception 'admin budget reconciliation RPC must be SECURITY DEFINER';
  end if;
  if v_config not like '%search_path=""%' then
    raise exception 'admin budget reconciliation RPC must pin an empty search_path';
  end if;
  if v_definition not ilike '%auth.uid()%' or v_definition not ilike '%p.role = ''admin''%' then
    raise exception 'admin budget reconciliation RPC must derive and verify the authenticated admin';
  end if;
  if v_definition not ilike '%for update%' then
    raise exception 'admin budget reconciliation RPC must lock the campaign row';
  end if;
  if v_definition not ilike '%cp.type = ''creator_payment''%'
     or v_definition not ilike '%cp.status in (''pending'', ''held'', ''released'')%' then
    raise exception 'admin budget reconciliation must use committed creator-payment ledger states only';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_reconcile_campaign_budget(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role must be able to invoke the admin-gated RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.admin_reconcile_campaign_budget(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role must not be able to invoke the RPC';
  end if;

  if not exists (
    select 1
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name = 'campaign_completion_notification'
      and event_object_table = 'campaigns'
  ) then
    raise exception 'campaign completion notification trigger must exist';
  end if;
end
$$;
