do $$
declare
  v_security_definer boolean;
  v_config text;
  v_definition text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'metric_verifications'
      and c.relrowsecurity
  ) then
    raise exception 'metric_verifications RLS must remain enabled';
  end if;

  if not has_column_privilege('authenticated', 'public.metric_verifications', 'evidence_url', 'SELECT')
     or not has_column_privilege('authenticated', 'public.metric_verifications', 'claimed_metric', 'SELECT')
     or not has_column_privilege('authenticated', 'public.metric_verifications', 'review_note', 'SELECT') then
    raise exception 'creator history must use only the narrow review columns granted by the manual-review migration';
  end if;

  if not has_function_privilege('authenticated', 'public.get_creator_metric_review_history(uuid,timestamptz,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_creator_metric_review_history(uuid,timestamptz,uuid,integer)', 'EXECUTE') then
    raise exception 'creator history RPC grants must be authenticated-only';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'metric_verifications_creator_history_idx'
  ) then
    raise exception 'creator evidence history index is missing';
  end if;

  select p.prosecdef,
         coalesce(pg_catalog.array_to_string(p.proconfig, ','), ''),
         pg_catalog.pg_get_functiondef(p.oid)
    into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_creator_metric_review_history'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)
      = 'p_submission_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_page_size integer';

  if v_security_definer is distinct from false
     or position('search_path=' in v_config) = 0 then
    raise exception 'creator history RPC must be SECURITY INVOKER with a pinned empty search path';
  end if;

  if position('creator_id' in v_definition) = 0
     or position('reviewed_by' in v_definition) > 0 then
    raise exception 'creator history must be owner-scoped and must not expose reviewer identity';
  end if;
end
$$;
