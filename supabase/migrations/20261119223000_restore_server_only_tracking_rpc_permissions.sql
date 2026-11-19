-- Restore the tracking RPC boundary after the public-execute regression.
-- Browser clients must go through the track-click Edge Function, which validates
-- the private proxy secret and derives server-side identity hashes before calling
-- these SECURITY DEFINER functions with the service-role client.
revoke all on function public.record_tracking_click(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_tracking_click(text,text,text,text,text)
  to service_role;

revoke all on function public.resolve_tracking_destination(text)
  from public, anon, authenticated;
grant execute on function public.resolve_tracking_destination(text)
  to service_role;
