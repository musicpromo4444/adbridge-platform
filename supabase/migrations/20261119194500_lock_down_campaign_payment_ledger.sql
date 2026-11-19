-- Financial ledger rows must never be mutated directly from a browser session.
revoke all on table public.campaign_payments from anon;
revoke insert, update, delete, truncate, references, trigger on table public.campaign_payments from authenticated;

-- The trusted payment Edge Functions use service_role. Admins may release a
-- held creator payment only through the fraud-aware RPC, which checks open
-- fraud reviews before changing the ledger state.
revoke all on function public.admin_release_held_creator_payment(uuid) from public, anon;
grant execute on function public.admin_release_held_creator_payment(uuid) to authenticated;
