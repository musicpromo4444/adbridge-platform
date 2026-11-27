revoke truncate,references,trigger on all tables in schema public from anon,authenticated;
revoke insert,delete on table public.profiles from authenticated;
grant select,update on table public.profiles to authenticated;