-- Creator verification is earned by publishing an AdBridge promotional post and submitting its public URL.
create table if not exists public.creator_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok','youtube','facebook','x','linkedin','snapchat','other')),
  post_type text not null check (post_type in ('text','image','video','story','reel','short')),
  post_url text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists creator_verification_queue_idx on public.creator_verification_submissions(status,created_at desc);
alter table public.creator_verification_submissions enable row level security;
drop policy if exists "creators read own verification submissions" on public.creator_verification_submissions;
create policy "creators read own verification submissions" on public.creator_verification_submissions for select to authenticated using (creator_id=auth.uid());
drop policy if exists "creators submit own verification" on public.creator_verification_submissions;
create policy "creators submit own verification" on public.creator_verification_submissions for insert to authenticated with check (creator_id=auth.uid() and status='pending');
drop policy if exists "admins manage creator verification" on public.creator_verification_submissions;
create policy "admins manage creator verification" on public.creator_verification_submissions for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create table if not exists public.notifications (
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
alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "admins create notifications" on public.notifications;
create policy "admins create notifications" on public.notifications for insert to authenticated with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Prevent creators from self-assigning the verified flag through profile updates.
create or replace function public.adbridge_protect_creator_verified_flag()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.verified is distinct from old.verified
     and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception 'Creator verification can only be changed by an administrator';
  end if;
  return new;
end;
$$;
drop trigger if exists adbridge_protect_creator_verified_flag on public.profiles;
create trigger adbridge_protect_creator_verified_flag
before update of verified on public.profiles
for each row execute function public.adbridge_protect_creator_verified_flag();
