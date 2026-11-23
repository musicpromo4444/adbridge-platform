do $$
declare
  v_security_definer boolean;
  v_config text;
  v_definition text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'metric_verifications'
      and c.relrowsecurity
  ) then
    raise exception 'metric_verifications RLS must remain enabled';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'metric_verifications'
      and policyname = 'participants read metric verifications'
      and cmd = 'SELECT'
      and position('admin' in coalesce(qual, '')) > 0
  ) then
    raise exception 'existing admin SELECT policy for metric verification history is missing';
  end if;

  if not has_function_privilege('authenticated', 'public.get_admin_metric_review_history(timestamptz,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_admin_metric_review_history(timestamptz,uuid,integer)', 'EXECUTE') then
    raise exception 'admin history RPC grants must be authenticated-only';
  end if;

  if has_table_privilege('authenticated', 'public.metric_verifications', 'UPDATE')
     or has_table_privilege('anon', 'public.metric_verifications', 'SELECT')
     or has_column_privilege('authenticated', 'public.metric_verifications', 'reviewed_by', 'SELECT') then
    raise exception 'manual metric review history must not widen browser table access or expose reviewer identity';
  end if;

  if not has_column_privilege('authenticated', 'public.metric_verifications', 'review_note', 'SELECT') then
    raise exception 'review feedback column must remain available under the existing participant RLS policy';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'metric_verifications_review_history_idx'
  ) then
    raise exception 'manual metric review history index is missing';
  end if;

  select p.prosecdef, coalesce(pg_catalog.array_to_string(p.proconfig, ','), ''),
         pg_catalog.pg_get_functiondef(p.oid)
    into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_metric_review_history'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)
      = 'p_before_reviewed_at timestamp with time zone, p_before_id uuid, p_page_size integer';

  if v_security_definer is distinct from false
     or position('search_path=' in v_config) = 0 then
    raise exception 'history RPC must be SECURITY INVOKER with a pinned empty search path';
  end if;

  if v_definition ilike '%creator_id%'
     or v_definition ilike '%reviewed_by%' then
    raise exception 'history RPC must not expose creator or reviewer identifiers';
  end if;
end
$$;
