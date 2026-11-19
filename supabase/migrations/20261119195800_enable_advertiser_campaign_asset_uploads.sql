insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-assets',
  'campaign-assets',
  true,
  104857600,
  array['image/jpeg','image/png','image/webp','video/mp4','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "advertisers upload campaign assets" on storage.objects;
create policy "advertisers upload campaign assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'advertiser'
  )
);

drop policy if exists "advertisers update own campaign assets" on storage.objects;
create policy "advertisers update own campaign assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'campaign-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'advertiser'
  )
)
with check (
  bucket_id = 'campaign-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'advertiser'
  )
);

drop policy if exists "advertisers delete own campaign assets" on storage.objects;
create policy "advertisers delete own campaign assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'campaign-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'advertiser'
  )
);
