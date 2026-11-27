begin;

-- A signed publisher event ID prevents request replay, while a stable receipt ID
-- prevents the same install/conversion from being submitted under a new event ID.
-- Scope uniqueness to publisher + event family so one publisher cannot earn twice
-- for the same external install or conversion receipt across multiple placements.
create unique index if not exists ad_placement_events_publisher_receipt_once
  on public.ad_placement_events (publisher_id, event_type, (metadata->>'receipt_id'))
  where publisher_id is not null
    and event_type in ('install', 'conversion')
    and nullif(metadata->>'receipt_id', '') is not null;

comment on index public.ad_placement_events_publisher_receipt_once is
  'Prevents the same publisher install/conversion receipt from being counted or paid more than once across placements and campaigns.';

commit;
