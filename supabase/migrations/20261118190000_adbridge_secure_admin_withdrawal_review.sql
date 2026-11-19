-- Admin withdrawal decisions are atomic and server-owned.
-- Approval authorizes payout processing; it does not claim that a bank transfer occurred.

alter table public.creator_withdrawals
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_note text;

create index if not exists creator_withdrawals_pending_created_at_idx
  on public.creator_withdrawals (created_at desc)
  where status = 'pending';

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;

-- Remove browser-side status mutation. Reads remain governed by existing RLS.
revoke update on table public.creator_withdrawals from public, anon, authenticated;

create or replace function adbridge_private.review_creator_withdrawal(
  p_withdrawal_id uuid,
  p_decision text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_role text;
  v_creator_id uuid;
  v_amount numeric;
  v_current_status text;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_admin_note, '')), '');
  v_body text;
begin
  if v_admin_id is null then
    raise exception using errcode = '28000', message = 'Sign in as an administrator to review withdrawals.';
  end if;

  select p.role
    into v_admin_role
    from public.profiles p
   where p.id = v_admin_id
   for share;

  if v_admin_role is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Administrator access required.';
  end if;

  if p_withdrawal_id is null or v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Choose a valid withdrawal and review decision.';
  end if;

  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'The review note must be 500 characters or fewer.';
  end if;

  select w.creator_id, w.amount, w.status
    into v_creator_id, v_amount, v_current_status
    from public.creator_withdrawals w
   where w.id = p_withdrawal_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Withdrawal request not found.';
  end if;

  -- Repeating the same decision is safe and does not send duplicate notifications.
  if v_current_status = v_decision then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'withdrawal_id', p_withdrawal_id,
      'amount', v_amount,
      'status', v_current_status,
      'unchanged', true
    );
  end if;

  if v_current_status is distinct from 'pending' then
    raise exception using errcode = 'P0001', message = 'Only pending withdrawal requests can be reviewed.';
  end if;

  -- Use the same per-creator lock as withdrawal requests so a rejection and a new
  -- request cannot calculate the available balance from an overlapping ledger state.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_creator_id::text, 0)
  );

  update public.creator_withdrawals
     set status = v_decision,
         reviewed_by = v_admin_id,
         reviewed_at = pg_catalog.now(),
         admin_note = v_note
   where id = p_withdrawal_id;

  if v_decision = 'approved' then
    v_body := 'Your withdrawal request has been approved for payout processing. This is not confirmation that funds have been transferred.';
  else
    v_body := 'Your withdrawal request was rejected and its reserved balance is now available again.'
      || case when v_note is null then '' else ' Review note: ' || v_note end;
  end if;

  insert into public.notifications (user_id, title, body, kind, link)
  values (
    v_creator_id,
    case when v_decision = 'approved' then 'Withdrawal approved for payout processing' else 'Withdrawal request rejected' end,
    v_body,
    'creator_withdrawal_review',
    '/creator/earnings'
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'amount', v_amount,
    'status', v_decision,
    'unchanged', false
  );
end;
$function$;

revoke all on function adbridge_private.review_creator_withdrawal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.review_creator_withdrawal(uuid, text, text)
  to authenticated;

create or replace function public.review_creator_withdrawal(
  p_withdrawal_id uuid,
  p_decision text,
  p_admin_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.review_creator_withdrawal(
    p_withdrawal_id,
    p_decision,
    p_admin_note
  );
$function$;

revoke all on function public.review_creator_withdrawal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_creator_withdrawal(uuid, text, text)
  to authenticated;

comment on function public.review_creator_withdrawal(uuid, text, text) is
  'Allows an authenticated administrator to approve or reject a pending creator withdrawal atomically and notify the creator. Approval is not proof of transfer.';
