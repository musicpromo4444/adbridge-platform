-- Creator promo-post verification workflow and in-app notifications
create table if not exists public.creator_verification_submissions(
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references public.profiles(id) on delete cascade,
 platform text not null check(platform in ('instagram','tiktok','youtube','facebook','x','linkedin','snapchat','other')),
 post_type text not null check(post_type in ('text','image','video','story','reel','short')),
 post_url text not null check(post_url like 'https://%'),
 note text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 admin_note text,
 reviewed_by uuid references public.profiles(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists creator_verification_pending_post_uq on public.creator_verification_submissions(creator_id,post_url) where status='pending';
create index if not exists creator_verification_submissions_status_created on public.creator_verification_submissions(status,created_at desc);
alter table public.creator_verification_submissions enable row level security;
drop policy if exists creator_verification_read_own_or_admin on public.creator_verification_submissions;
create policy creator_verification_read_own_or_admin on public.creator_verification_submissions for select to authenticated using (creator_id=auth.uid() or private.current_user_profile_role()='admin');
drop policy if exists creator_verification_insert_own_pending on public.creator_verification_submissions;
create policy creator_verification_insert_own_pending on public.creator_verification_submissions for insert to authenticated with check (creator_id=auth.uid() and private.current_user_profile_role()='creator' and status='pending' and post_url like 'https://%');
drop policy if exists creator_verification_update_admin on public.creator_verification_submissions;
create policy creator_verification_update_admin on public.creator_verification_submissions for update to authenticated using (private.current_user_profile_role()='admin') with check (private.current_user_profile_role()='admin');
grant select,insert,update on public.creator_verification_submissions to authenticated;

create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null,
 body text not null,
 kind text not null default 'general',
 link text,
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id,created_at desc) where is_read=false;
alter table public.notifications enable row level security;
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists notifications_insert_admin on public.notifications;
create policy notifications_insert_admin on public.notifications for insert to authenticated with check (private.current_user_profile_role()='admin');
grant select,insert on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update(is_read) on public.notifications to authenticated;

create or replace function public.admin_review_creator_verification(p_submission_id uuid,p_status text,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_submission public.creator_verification_submissions%rowtype;v_note text:=nullif(trim(coalesce(p_admin_note,'')),'');
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501';end if;
 if p_status not in ('approved','rejected') then raise exception 'invalid review status' using errcode='22023';end if;
 if p_status='rejected' and v_note is null then raise exception 'a rejection note is required' using errcode='22023';end if;
 select * into v_submission from public.creator_verification_submissions where id=p_submission_id for update;
 if not found then raise exception 'verification submission not found' using errcode='P0002';end if;
 if v_submission.status<>'pending' then raise exception 'this submission has already been reviewed' using errcode='22023';end if;
 update public.creator_verification_submissions set status=p_status,admin_note=v_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_submission_id;
 if p_status='approved' then
  update public.profiles set verified=true where id=v_submission.creator_id and role='creator';
  if not found then raise exception 'creator profile not found';end if;
  insert into public.notifications(user_id,title,body,kind,link) values(v_submission.creator_id,'Creator listing verified','Your AdBridge promotional post was approved. Your creator listing is now verified.','creator_verification','/creator/verification');
 else
  insert into public.notifications(user_id,title,body,kind,link) values(v_submission.creator_id,'Creator verification needs attention','Your AdBridge promotional post was not approved. '||v_note,'creator_verification','/creator/verification');
 end if;
 return jsonb_build_object('ok',true,'submission_id',p_submission_id,'status',p_status,'creator_verified',p_status='approved');
end;$$;
