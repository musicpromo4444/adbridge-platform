create table if not exists public.publisher_tracking_secrets (
  property_id uuid primary key references public.publisher_properties(id) on delete cascade,
  publisher_id uuid not null references public.profiles(id) on delete cascade,
  secret_value text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.publisher_tracking_secrets enable row level security;
revoke all on public.publisher_tracking_secrets from public,anon,authenticated;
grant select,insert,update,delete on public.publisher_tracking_secrets to service_role;
