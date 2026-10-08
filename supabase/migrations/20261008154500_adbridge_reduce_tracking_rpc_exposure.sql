-- The withdrawal RPC now runs as invoker; its RLS policies provide the authorization boundary.
alter function public.request_creator_withdrawal(numeric) security invoker;
revoke execute on function public.record_tracking_click(text,text,text,text) from anon, authenticated;
