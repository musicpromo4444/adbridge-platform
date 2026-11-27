revoke all on table public.creator_campaigns from public,anon,authenticated;
grant select on table public.creator_campaigns to authenticated;
revoke all on table public.submissions from public,anon,authenticated;
grant select on table public.submissions to authenticated;
revoke all on table public.tracking_links from public,anon,authenticated;
grant select on table public.tracking_links to authenticated;
revoke all on table public.creator_verification_submissions from public,anon,authenticated;
grant select on table public.creator_verification_submissions to authenticated;