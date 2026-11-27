create unique index if not exists creator_verification_submissions_pending_post_unique
on public.creator_verification_submissions(creator_id,lower(post_url))
where status='pending';

create or replace function public.submit_creator_verification(
 p_platform text,p_post_type text,p_post_url text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();
 v_role text;
 v_platform text:=lower(trim(coalesce(p_platform,'')));
 v_post_type text:=lower(trim(coalesce(p_post_type,'')));
 v_url text:=trim(coalesce(p_post_url,''));
 v_host text;
 v_path text;
 v_match text[];
 v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into v_role from public.profiles where id=v_user;
 if v_role<>'creator' then raise exception 'Creator account required' using errcode='42501'; end if;
 if v_platform not in ('instagram','tiktok','youtube','facebook','x','linkedin','snapchat','other') then raise exception 'Choose a supported social platform' using errcode='22023'; end if;
 if v_post_type not in ('text','image','video','story','reel','short') then raise exception 'Choose a valid post format' using errcode='22023'; end if;
 if length(v_url)<12 or length(v_url)>2048 or v_url ~ '[[:space:]]' then raise exception 'Enter a valid public post URL' using errcode='22023'; end if;
 v_match:=regexp_match(v_url,'^https://([^/?#]+)(/[^?#]*)$','i');
 if v_match is null then raise exception 'Use a direct HTTPS post URL without query strings or fragments' using errcode='22023'; end if;
 v_host:=lower(v_match[1]); v_path:=v_match[2];
 if v_host ~ '[@:]' or v_host in ('localhost','127.0.0.1','0.0.0.0') or v_host like '%.localhost' or v_host like '%.local' then raise exception 'Private or credential-bearing URLs are not accepted' using errcode='22023'; end if;
 v_host:=regexp_replace(v_host,'^(www|m)\.','');
 if v_host like '%adbridge-platform.vercel.app' or v_host like '%adbridge.app' then raise exception 'Submit a post hosted on the selected social platform' using errcode='22023'; end if;
 if v_platform='instagram' and not(v_host='instagram.com' and v_path ~ '^/(p|reel|tv|stories)/[^/]+') then raise exception 'Use a direct Instagram post, reel or story link' using errcode='22023'; end if;
 if v_platform='tiktok' and not((v_host='tiktok.com' and v_path ~ '^/@[^/]+/video/[0-9]+/?$') or (v_host in ('vm.tiktok.com','vt.tiktok.com') and v_path ~ '^/[A-Za-z0-9]+/?$')) then raise exception 'Use a direct TikTok video link' using errcode='22023'; end if;
 if v_platform='youtube' and not((v_host='youtu.be' and v_path ~ '^/[A-Za-z0-9_-]{6,}/?$') or (v_host='youtube.com' and v_path ~ '^/(shorts|embed|live)/[A-Za-z0-9_-]{6,}/?$')) then raise exception 'Use a direct YouTube video or Shorts link' using errcode='22023'; end if;
 if v_platform='facebook' and not(v_host in ('facebook.com','fb.watch') and v_path ~ '^/(watch|reel|videos|[^/]+/posts|[^/]+/videos)/') then raise exception 'Use a direct Facebook post, reel or video link' using errcode='22023'; end if;
 if v_platform='x' and not(v_host in ('x.com','twitter.com') and v_path ~ '^/[^/]+/status/[0-9]+/?$') then raise exception 'Use a direct X post link' using errcode='22023'; end if;
 if v_platform='linkedin' and not(v_host='linkedin.com' and v_path ~ '^/(posts|feed/update)/') then raise exception 'Use a direct LinkedIn post link' using errcode='22023'; end if;
 if v_platform='snapchat' and not(v_host='snapchat.com' and v_path ~ '^/(spotlight|story|add)/') then raise exception 'Use a direct Snapchat post or story link' using errcode='22023'; end if;
 if v_platform='other' and array_length(string_to_array(trim(both '/' from v_path),'/'),1)<2 then raise exception 'Use a direct public post URL, not a profile or homepage' using errcode='22023'; end if;
 if exists(select 1 from public.creator_verification_submissions s where s.creator_id=v_user and s.status='pending' and lower(s.post_url)=lower(v_url)) then raise exception 'This post already has a pending verification request' using errcode='23505'; end if;
 insert into public.creator_verification_submissions(creator_id,platform,post_type,post_url,note,status)
 values(v_user,v_platform,v_post_type,v_url,nullif(trim(coalesce(p_note,'')),''),'pending')
 returning id into v_id;
 return jsonb_build_object('success',true,'submission_id',v_id,'status','pending');
end; $$;

revoke all on function public.submit_creator_verification(text,text,text,text) from public,anon;
grant execute on function public.submit_creator_verification(text,text,text,text) to authenticated;

revoke insert,update,delete on public.creator_campaigns from public,anon,authenticated;
grant select on public.creator_campaigns to authenticated;
revoke insert,update,delete on public.submissions from public,anon,authenticated;
grant select on public.submissions to authenticated;
revoke insert,update,delete on public.tracking_links from public,anon,authenticated;
grant select on public.tracking_links to authenticated;
revoke insert,update,delete on public.creator_verification_submissions from public,anon,authenticated;
grant select on public.creator_verification_submissions to authenticated;