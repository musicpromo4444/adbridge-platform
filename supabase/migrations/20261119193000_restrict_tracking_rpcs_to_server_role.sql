revoke all on function public.resolve_tracking_destination(text) from public, anon, authenticated;
grant execute on function public.resolve_tracking_destination(text) to service_role;
revoke all on function public.record_tracking_click(text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_tracking_click(text,text,text,text) to service_role;
