begin;

-- These two RPCs are intentionally available to signed-in administrators.
-- Their bodies enforce the admin role. They must never be callable by anon.
revoke all on function public.admin_launch_readiness() from public, anon;
grant execute on function public.admin_launch_readiness() to authenticated, service_role;

revoke all on function public.admin_review_creator_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_review_creator_verification(uuid, text, text) to authenticated, service_role;

-- Trigger functions are invoked by PostgreSQL triggers, not by browser RPC calls.
-- Remove all API-role EXECUTE grants; the table trigger continues to invoke it.
revoke all on function public.sync_approved_publisher_ad_placement() from public, anon, authenticated, service_role;

comment on function public.admin_launch_readiness() is
  'Admin-only launch readiness RPC. Browser execution is limited to authenticated users and the function verifies the admin profile role.';
comment on function public.admin_review_creator_verification(uuid, text, text) is
  'Admin-only creator verification review RPC. Browser execution is limited to authenticated users and the function verifies the admin profile role.';
comment on function public.sync_approved_publisher_ad_placement() is
  'Internal trigger function; no browser or service-role EXECUTE grant is required.';

commit;
