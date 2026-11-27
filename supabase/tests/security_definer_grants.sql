-- Run after 202611270009_restrict_anonymous_security_definer_entrypoints.sql.
do $$
declare
  v_signature text;
  v_privileged_functions text[] := array[
    'public.get_adbridge_global_rankings()',
    'public.admin_launch_readiness()',
    'public.admin_review_creator_verification(uuid,text,text)',
    'public.disconnect_creator_platform(text)',
    'public.get_advertiser_measurement_summary()',
    'public.get_campaign_measurement_summary(uuid)',
    'public.get_creator_measurement_summary()',
    'public.assess_tracking_click_fraud()',
    'public.notify_advertiser_campaign_status()',
    'public.notify_advertiser_funding_status()',
    'public.notify_creator_cpm_payment()',
    'public.notify_creator_submission_review()',
    'public.notify_creator_withdrawal_status()',
    'public.notify_publisher_application_decision()',
    'public.sync_approved_publisher_ad_placement()'
  ];
  v_trigger_functions text[] := array[
    'public.assess_tracking_click_fraud()',
    'public.notify_advertiser_campaign_status()',
    'public.notify_advertiser_funding_status()',
    'public.notify_creator_cpm_payment()',
    'public.notify_creator_submission_review()',
    'public.notify_creator_withdrawal_status()',
    'public.notify_publisher_application_decision()',
    'public.sync_approved_publisher_ad_placement()'
  ];
begin
  if has_function_privilege('anon', 'public.admin_launch_readiness()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_launch_readiness()', 'EXECUTE') then
    raise exception 'admin_launch_readiness grants are incorrect';
  end if;

  if has_function_privilege('anon', 'public.admin_review_creator_verification(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_review_creator_verification(uuid,text,text)', 'EXECUTE') then
    raise exception 'admin_review_creator_verification grants are incorrect';
  end if;

  if has_function_privilege('anon', 'public.disconnect_creator_platform(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.disconnect_creator_platform(text)', 'EXECUTE') then
    raise exception 'disconnect_creator_platform grants are incorrect';
  end if;

  if has_function_privilege('anon', 'public.get_advertiser_measurement_summary()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_advertiser_measurement_summary()', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_campaign_measurement_summary(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_campaign_measurement_summary(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_creator_measurement_summary()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_creator_measurement_summary()', 'EXECUTE') then
    raise exception 'measurement RPC grants are incorrect';
  end if;

  foreach v_signature in array v_trigger_functions loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'trigger function remains directly executable by an API role: %', v_signature;
    end if;
    if not exists (
      select 1 from pg_trigger t
      where t.tgfoid = v_signature::regprocedure and not t.tgisinternal
    ) then
      raise exception 'expected trigger binding is missing for %', v_signature;
    end if;
  end loop;

  -- The global ranking function stays public by design; the others must not.
  if not has_function_privilege('anon', 'public.get_adbridge_global_rankings()', 'EXECUTE') then
    raise exception 'public global rankings access was unintentionally removed';
  end if;

  foreach v_signature in array v_privileged_functions loop
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_signature::regprocedure
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']
    ) then
      raise exception 'function does not have an empty search_path: %', v_signature;
    end if;
  end loop;
end;
$$;
