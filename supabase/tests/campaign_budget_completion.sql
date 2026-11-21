-- Read-only post-deployment assertions for the campaign lifecycle migration.
do $$
declare
  v_rls boolean;
  v_table_update boolean;
  v_read_state_update boolean;
  v_body_update boolean;
  v_insert boolean;
  v_service_insert boolean;
  v_trigger_count integer;
  v_fn record;
begin
  select c.relrowsecurity
    into v_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'notifications';

  if not coalesce(v_rls, false) then
    raise exception 'notifications must have RLS enabled';
  end if;

  if not has_table_privilege('authenticated', 'public.notifications', 'SELECT') then
    raise exception 'authenticated must be able to read owner-scoped notifications';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'campaign_id'
      and data_type = 'uuid'
  ) then
    raise exception 'notifications.campaign_id must exist as uuid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'completion_reason'
      and data_type = 'text'
  ) then
    raise exception 'notifications.completion_reason must exist as text';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_campaign_id_fkey'
      and contype = 'f'
  ) then
    raise exception 'notifications.campaign_id must reference campaigns';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_completion_reason_check'
      and contype = 'c'
  ) then
    raise exception 'notifications.completion_reason must be constrained to supported reasons';
  end if;


  v_table_update := has_table_privilege('authenticated', 'public.notifications', 'UPDATE');
  v_read_state_update := has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE');
  v_body_update := has_column_privilege('authenticated', 'public.notifications', 'body', 'UPDATE');
  v_insert := has_table_privilege('authenticated', 'public.notifications', 'INSERT');
  v_service_insert := has_table_privilege('service_role', 'public.notifications', 'INSERT');

  if v_table_update or not v_read_state_update or v_body_update or v_insert or not v_service_insert then
    raise exception 'notification grants are broader or narrower than the is_read-only contract';
  end if;

  select count(distinct trigger_name) into v_trigger_count
  from information_schema.triggers
  where trigger_schema = 'public'
    and trigger_name in (
      'campaign_completion_metadata_guard',
      'campaign_completion_notification',
      'campaign_budget_after_creator_payment',
      'campaign_budget_after_tracking_click',
      'campaign_budget_after_conversion',
      'campaign_budget_after_publisher_event',
      'campaign_budget_after_verified_submission_metric'
    );

  if v_trigger_count <> 7 then
    raise exception 'expected seven campaign lifecycle triggers, found %', v_trigger_count;
  end if;

  select p.prosecdef, p.proconfig
    into v_fn
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'reconcile_campaign_budget_completion';

  if not found or not v_fn.prosecdef or coalesce(array_to_string(v_fn.proconfig, ','), '') not like '%search_path=%' then
    raise exception 'budget reconciliation helper must be SECURITY DEFINER with an explicit search_path';
  end if;
end
$$;
