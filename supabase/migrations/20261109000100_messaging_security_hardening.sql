-- CINEVA Phase 4 security hardening.
-- Review and apply only through the normal migration process in an isolated project first.
-- This migration preserves conversation, message, attachment, and moderation workflows;
-- it closes block/suspension write gaps and limits content-manager attachment metadata reads.

create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_active_user() and exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = target_conversation_id
      and p.user_id = (select auth.uid())
      and p.left_at is null
  );
$$;

drop policy messages_sender_update on public.messages;
create policy messages_sender_update on public.messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and public.is_active_user()
  and public.is_conversation_participant(conversation_id)
  and not exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = messages.conversation_id
      and p.user_id <> (select auth.uid())
      and p.left_at is null
      and public.is_blocked_between((select auth.uid()), p.user_id)
  )
)
with check (
  sender_id = (select auth.uid())
  and public.is_active_user()
  and public.is_conversation_participant(conversation_id)
  and not exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = messages.conversation_id
      and p.user_id <> (select auth.uid())
      and p.left_at is null
      and public.is_blocked_between((select auth.uid()), p.user_id)
  )
);

drop policy attachments_sender_insert on public.message_attachments;
create policy attachments_sender_insert on public.message_attachments
for insert to authenticated
with check (
  public.is_active_user()
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id = (select auth.uid())
      and m.deleted_at is null
      and public.is_conversation_participant(m.conversation_id)
      and not exists (
        select 1
        from public.conversation_participants p
        where p.conversation_id = m.conversation_id
          and p.user_id <> (select auth.uid())
          and p.left_at is null
          and public.is_blocked_between((select auth.uid()), p.user_id)
      )
  )
  and exists (
    select 1
    from public.media_assets a
    join public.messages m on m.id = message_id
    where a.id = media_asset_id
      and a.created_by = (select auth.uid())
      and a.asset_type = 'message_attachment'
      and a.bucket = 'private-message-attachments'
      and split_part(a.object_key, '/', 1) = m.conversation_id::text
      and split_part(a.object_key, '/', 2) = (select auth.uid())::text
  )
);

drop policy message_attachment_participant_read on storage.objects;
create policy message_attachment_participant_read on storage.objects
for select to authenticated
using (
  bucket_id = 'private-message-attachments'
  and public.is_active_user()
  and exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id::text = split_part(name, '/', 1)
      and p.user_id = (select auth.uid())
      and p.left_at is null
  )
);

drop policy message_attachment_participant_insert on storage.objects;
create policy message_attachment_participant_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'private-message-attachments'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and public.is_active_user()
  and exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id::text = split_part(name, '/', 1)
      and p.user_id = (select auth.uid())
      and p.left_at is null
  )
  and not exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id::text = split_part(name, '/', 1)
      and p.user_id <> (select auth.uid())
      and p.left_at is null
      and public.is_blocked_between((select auth.uid()), p.user_id)
  )
);

drop policy public_content_artwork_read on public.media_assets;
create policy public_content_artwork_read on public.media_assets
for select to anon, authenticated
using (
  (
    asset_type in ('poster', 'banner', 'thumbnail', 'narrator_image')
    and (
      exists (
        select 1
        from public.content_items c
        where c.status = 'published'
          and media_assets.id in (c.poster_asset_id, c.banner_asset_id, c.narrator_image_asset_id)
      )
      or exists (
        select 1
        from public.episodes e
        join public.seasons s on s.id = e.season_id
        join public.content_items c on c.id = s.series_id
        where c.status = 'published'
          and e.thumbnail_asset_id = media_assets.id
      )
      or (public.has_permission('content.manage') and asset_type <> 'message_attachment')
    )
  )
  or created_by = (select auth.uid())
);
