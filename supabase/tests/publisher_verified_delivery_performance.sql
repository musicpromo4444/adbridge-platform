-- Run after applying 20261127193500_publisher_verified_delivery_performance.
do $$
declare
  v_oid oid := to_regprocedure('public.get_publisher_delivery_performance(integer)');
  v_definition text;
begin
  if v_oid is null then raise exception 'Publisher performance RPC is missing'; end if;
  select pg_get_functiondef(v_oid) into v_definition;
  if position('auth.uid()' in v_definition) = 0
     or position('p.role = ''publisher''' in v_definition) = 0
     or position('a.publisher_id = v_uid' in v_definition) = 0
     or position('a.source_table = ''ad_placement_events''' in v_definition) = 0 then
    raise exception 'Publisher performance RPC is missing owner/source scoping';
  end if;
  if position('ip_hash' in v_definition) > 0
     or position('visitor_hash' in v_definition) > 0
     or position('session_hash' in v_definition) > 0
     or position('user_agent_hash' in v_definition) > 0 then
    raise exception 'Publisher performance RPC must not expose visitor identifiers';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or exists (
       select 1 from pg_proc p,
         lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = v_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'Anonymous execution must be revoked';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'Authenticated execution grant is missing';
  end if;
  if (select prosecdef from pg_proc where oid = v_oid) is not true then
    raise exception 'RPC must bypass admin-only source RLS only after explicit publisher ownership check';
  end if;
  if (select proconfig from pg_proc where oid = v_oid)::text not like '%search_path=%' then
    raise exception 'RPC must pin an empty search path';
  end if;
end $$;
