begin;

-- Evidence URLs are opened by administrators. Reject embedded URL credentials
-- at the database boundary so RPC and any permitted table write share the rule.
create or replace function public.guard_metric_verification_evidence_url()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_url text;
  v_authority text;
begin
  if new.evidence_url is null then
    return new;
  end if;

  v_url := pg_catalog.btrim(new.evidence_url);
  v_authority := (pg_catalog.regexp_match(v_url, '^https?://([^/?#]+)', 'i'))[1];

  if v_url = ''
     or v_url ~ '[[:space:]]'
     or v_authority is null
     or v_authority ~ '@' then
    raise exception 'evidence URL must be HTTP(S) without embedded credentials or whitespace'
      using errcode = '22023';
  end if;

  new.evidence_url := v_url;
  return new;
end;
$function$;

revoke all on function public.guard_metric_verification_evidence_url()
  from public, anon, authenticated, service_role;

drop trigger if exists metric_verifications_evidence_url_guard
  on public.metric_verifications;

create trigger metric_verifications_evidence_url_guard
before insert or update of evidence_url
on public.metric_verifications
for each row
execute function public.guard_metric_verification_evidence_url();

comment on function public.guard_metric_verification_evidence_url() is
  'Trigger-only validation rejecting manual metric evidence URLs with embedded credentials or whitespace.';

commit;
