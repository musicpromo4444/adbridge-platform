-- Read-only deployment assertions for the social post path guard.
do $$
declare
  v_definition text;
  v_trigger boolean;
begin
  select pg_get_functiondef('public.enforce_official_social_submission_host()'::regprocedure)
    into v_definition;
  if v_definition not ilike '%post path%' then
    raise exception 'post path validation is missing from trigger function';
  end if;
  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.submissions'::regclass
      and tgname = 'submissions_official_social_host_guard'
      and not tgisinternal
  ) into v_trigger;
  if not v_trigger then
    raise exception 'social post host/path trigger is missing';
  end if;
end $$;
