do $$
declare
  v_invoker boolean;
  v_config text;
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.metric_verifications'::regclass
      and attname = 'reviewed_by' and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.metric_verifications'::regclass
      and attname = 'review_note' and not attisdropped
  ) then
    raise exception 'manual metric review audit columns are missing';
  end if;

  if has_table_privilege('anon', 'public.metric_verifications', 'UPDATE')
     or has_table_privilege('authenticated', 'public.metric_verifications', 'UPDATE') then
    raise exception 'browser roles must not update manual metric review records directly';
  end if;

  if not has_column_privilege('authenticated', 'public.metric_verifications', 'submission_id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.metric_verifications', 'claimed_metric', 'INSERT')
     or has_column_privilege('authenticated', 'public.metric_verifications', 'status', 'INSERT')
     or has_column_privilege('authenticated', 'public.metric_verifications', 'reviewed_by', 'INSERT') then
    raise exception 'creator insert privileges are not limited to evidence fields';
  end if;

  if not has_column_privilege('authenticated', 'public.metric_verifications', 'review_note', 'SELECT')
     or has_column_privilege('authenticated', 'public.metric_verifications', 'reviewed_by', 'SELECT') then
    raise exception 'creator metric review visibility exposes internal reviewer identity or hides feedback';
  end if;

  if not has_function_privilege('authenticated', 'public.submit_manual_metric_evidence(uuid,bigint,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.submit_manual_metric_evidence(uuid,bigint,text,text)', 'EXECUTE') then
    raise exception 'creator evidence RPC grants are incorrect';
  end if;

  if has_function_privilege('anon', 'public.admin_review_manual_metric_verification(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_review_manual_metric_verification(uuid,text,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_review_manual_metric_verification(uuid,text,uuid,text)', 'EXECUTE') then
    raise exception 'administrator review RPC must be service-role-only';
  end if;

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_invoker, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_review_manual_metric_verification'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_metric_verification_id uuid, p_decision text, p_reviewed_by uuid, p_review_note text';

  if v_invoker is distinct from false or position('search_path=' in v_config) = 0 then
    raise exception 'administrator review RPC must be invoker-security with a pinned empty search path';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notifications' and c.relrowsecurity
  ) then
    raise exception 'notifications RLS is not enabled';
  end if;

  if not has_table_privilege('authenticated', 'public.notifications', 'SELECT')
     or not has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE')
     or has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or has_table_privilege('anon', 'public.notifications', 'SELECT') then
    raise exception 'notification owner read-state grants are incorrect';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_owner_select'
      and cmd = 'SELECT'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_owner_read_state'
      and cmd = 'UPDATE'
  ) then
    raise exception 'notification owner RLS policies are missing';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'metric_verifications'
      and policyname = 'admin update metric verifications'
  ) then
    raise exception 'obsolete direct admin metric-update policy remains';
  end if;
end
$$;
