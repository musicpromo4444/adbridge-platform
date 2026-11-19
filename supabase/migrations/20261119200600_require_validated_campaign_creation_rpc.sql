-- Campaign creation must pass through the validated, atomic SECURITY DEFINER RPC.
revoke insert on table public.campaigns from authenticated;
grant select on table public.campaigns to authenticated;
