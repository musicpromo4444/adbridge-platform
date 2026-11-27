-- Read-only post-deployment assertions.
select pg_get_functiondef('public.enforce_official_social_submission_host()'::regprocedure) like '%navigation route%' as rejects_navigation_routes,
exists(select 1 from pg_trigger where tgrelid='public.submissions'::regclass and tgname='submissions_official_social_host_guard' and not tgisinternal) as trigger_installed,
has_function_privilege('authenticated','public.enforce_official_social_submission_host()','execute') as authenticated_cannot_execute_trigger_function;