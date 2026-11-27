create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_display_name text default null,
  p_email text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select private.bootstrap_first_admin(p_user_id, p_display_name, p_email);
$function$;

revoke all on function public.bootstrap_first_admin(uuid,text,text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text) to service_role;
