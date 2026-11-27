begin;

-- The worldwide top-20 rankings are intentionally public and read-only.
-- Their query schema-qualifies all relations, so use an empty search path.
alter function public.get_adbridge_global_rankings() set search_path = '';

-- Admin RPCs remain available to signed-in users because each function verifies
-- the caller's profile role. Anonymous callers must never reach these routines.
revoke all on function public.admin_launch_readiness() from public, anon;
grant execute on function public.admin_launch_readiness() to authenticated, service_role;
alter function public.admin_launch_readiness() set search_path = '';

revoke all on function public.admin_review_creator_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_review_creator_verification(uuid, text, text) to authenticated, service_role;
alter function public.admin_review_creator_verification(uuid, text, text) set search_path = '';

-- These owner-scoped RPCs explicitly require auth.uid() and validate account
-- ownership/role internally. Keep authenticated access, remove anonymous access.
revoke all on function public.disconnect_creator_platform(text) from public, anon;
grant execute on function public.disconnect_creator_platform(text) to authenticated, service_role;
alter function public.disconnect_creator_platform(text) set search_path = '';

revoke all on function public.get_advertiser_measurement_summary() from public, anon;
grant execute on function public.get_advertiser_measurement_summary() to authenticated, service_role;
alter function public.get_advertiser_measurement_summary() set search_path = '';

revoke all on function public.get_campaign_measurement_summary(uuid) from public, anon;
grant execute on function public.get_campaign_measurement_summary(uuid) to authenticated, service_role;
alter function public.get_campaign_measurement_summary(uuid) set search_path = '';

revoke all on function public.get_creator_measurement_summary() from public, anon;
grant execute on function public.get_creator_measurement_summary() to authenticated, service_role;
alter function public.get_creator_measurement_summary() set search_path = '';

-- Trigger functions are invoked by PostgreSQL triggers, not browser RPC calls.
-- Remove EXECUTE grants from all API roles; existing triggers remain installed.
-- Their bodies use schema-qualified objects, so an empty search path is safe.
revoke all on function public.assess_tracking_click_fraud() from public, anon, authenticated, service_role;
alter function public.assess_tracking_click_fraud() set search_path = '';

revoke all on function public.notify_advertiser_campaign_status() from public, anon, authenticated, service_role;
alter function public.notify_advertiser_campaign_status() set search_path = '';

revoke all on function public.notify_advertiser_funding_status() from public, anon, authenticated, service_role;
alter function public.notify_advertiser_funding_status() set search_path = '';

revoke all on function public.notify_creator_cpm_payment() from public, anon, authenticated, service_role;
alter function public.notify_creator_cpm_payment() set search_path = '';

revoke all on function public.notify_creator_submission_review() from public, anon, authenticated, service_role;
alter function public.notify_creator_submission_review() set search_path = '';

revoke all on function public.notify_creator_withdrawal_status() from public, anon, authenticated, service_role;
alter function public.notify_creator_withdrawal_status() set search_path = '';

revoke all on function public.notify_publisher_application_decision() from public, anon, authenticated, service_role;
alter function public.notify_publisher_application_decision() set search_path = '';

revoke all on function public.sync_approved_publisher_ad_placement() from public, anon, authenticated, service_role;
alter function public.sync_approved_publisher_ad_placement() set search_path = '';

comment on function public.get_adbridge_global_rankings() is
  'Public worldwide top-20 rankings. Read-only query uses an empty search path.';
comment on function public.admin_launch_readiness() is
  'Admin-only launch readiness RPC. Browser execution is limited to authenticated users and the function verifies the admin profile role.';
comment on function public.admin_review_creator_verification(uuid, text, text) is
  'Admin-only creator verification review RPC. Browser execution is limited to authenticated users and the function verifies the admin profile role.';
comment on function public.disconnect_creator_platform(text) is
  'Authenticated creator-only social disconnect RPC; anonymous execution is revoked.';
comment on function public.get_advertiser_measurement_summary() is
  'Authenticated advertiser/admin measurement summary; anonymous execution is revoked.';
comment on function public.get_campaign_measurement_summary(uuid) is
  'Authenticated campaign-owner/admin measurement summary; anonymous execution is revoked.';
comment on function public.get_creator_measurement_summary() is
  'Authenticated creator/publisher measurement summary; anonymous execution is revoked.';
comment on function public.assess_tracking_click_fraud() is
  'Internal tracking-click trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_advertiser_campaign_status() is
  'Internal campaign notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_advertiser_funding_status() is
  'Internal funding notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_creator_cpm_payment() is
  'Internal CPM payment notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_creator_submission_review() is
  'Internal creator submission notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_creator_withdrawal_status() is
  'Internal creator withdrawal notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.notify_publisher_application_decision() is
  'Internal publisher application notification trigger function; no API-role EXECUTE grant is required.';
comment on function public.sync_approved_publisher_ad_placement() is
  'Internal publisher placement trigger function; no API-role EXECUTE grant is required.';

commit;
