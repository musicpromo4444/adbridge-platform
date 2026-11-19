-- AdBridge fraud and measurement ledger. Apply in the linked Supabase project before enabling ingestion.
create extension if not exists pgcrypto;

create table if not exists public.adbridge_ad_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  campaign_id uuid not null,
  publisher_id uuid not null,
  placement_id uuid,
  event_type text not null check (event_type in ('click','video_view','impression','install','conversion')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  risk_score smallint not null check (risk_score between 0 and 100),
  risk_band text not null check (risk_band in ('low','review','high','blocked')),
  accepted boolean not null default false,
  verified boolean not null default false,
  payable boolean not null default false,
  metric text not null check (metric in ('clicks','views','impressions','installs','conversions','none')),
  reasons text[] not null default '{}',
  device_hash text,
  ip_hash text,
  session_id text,
  evidence jsonb not null default '{}'::jsonb,
  review_status text not null default 'not_required' check (review_status in ('not_required','pending','cleared','invalid')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  constraint payable_requires_verified check (not payable or verified)
);
create index if not exists adbridge_events_campaign_time on public.adbridge_ad_events(campaign_id, occurred_at desc);
create index if not exists adbridge_events_publisher_time on public.adbridge_ad_events(publisher_id, occurred_at desc);
create index if not exists adbridge_events_risk_queue on public.adbridge_ad_events(risk_band, review_status, received_at desc);
create index if not exists adbridge_events_device_time on public.adbridge_ad_events(device_hash, received_at desc) where device_hash is not null;

alter table public.adbridge_ad_events enable row level security;
revoke all on public.adbridge_ad_events from anon, authenticated;
grant select,insert,update,delete on public.adbridge_ad_events to service_role;

-- Never expose raw evidence, IP/device hashes or risk signals to public publisher profiles.
create or replace view public.adbridge_verified_event_totals
with (security_invoker = true) as
select publisher_id, campaign_id, metric, count(*)::bigint as verified_events,
       date_trunc('day', occurred_at) as event_day
from public.adbridge_ad_events
where verified = true and payable = true and risk_band = 'low'
group by publisher_id, campaign_id, metric, date_trunc('day', occurred_at);
revoke all on public.adbridge_verified_event_totals from anon, authenticated;
grant select on public.adbridge_verified_event_totals to service_role;

-- Server-only idempotent event counters; event IDs are unique and duplicate inserts cannot pay twice.
create or replace function public.adbridge_fraud_health()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'events_24h', count(*),
    'verified_24h', count(*) filter (where verified and payable),
    'review_queue', count(*) filter (where review_status = 'pending'),
    'high_risk_24h', count(*) filter (where risk_band in ('high','blocked')),
    'invalidated_24h', count(*) filter (where review_status = 'invalid')
  )
  from public.adbridge_ad_events
  where received_at >= now() - interval '24 hours';
$$;
revoke all on function public.adbridge_fraud_health() from public, anon, authenticated;
grant execute on function public.adbridge_fraud_health() to service_role;
