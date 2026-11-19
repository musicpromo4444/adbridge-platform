create table if not exists public.adbridge_service_secrets (
  key_name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);
alter table public.adbridge_service_secrets enable row level security;
revoke all on public.adbridge_service_secrets from public,anon,authenticated;
grant select on public.adbridge_service_secrets to service_role;
