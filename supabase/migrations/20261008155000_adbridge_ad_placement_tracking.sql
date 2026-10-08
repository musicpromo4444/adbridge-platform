create table if not exists public.ad_placement_events (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.ad_placements(id) on delete cascade,
  event_type text not null check (event_type in ('impression','click')),
  visitor_key text not null,
  session_id text,
  country text,
  occurred_at timestamptz not null default now()
);
create index if not exists ad_placement_events_placement_time_idx on public.ad_placement_events(placement_id,occurred_at desc);
create index if not exists ad_placement_events_country_idx on public.ad_placement_events(country);
alter table public.ad_placement_events enable row level security;
create policy "admins read ad placement events" on public.ad_placement_events for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
