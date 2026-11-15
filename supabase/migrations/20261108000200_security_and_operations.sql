-- Auth profile provisioning, least-privilege grants, RLS, conversation RPCs, storage, and audit.
create or replace function public.has_permission(permission_name text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles pr on pr.id = ur.user_id and pr.account_status = 'active'
    where ur.user_id = (select auth.uid()) and p.name = permission_name
  );
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to anon, authenticated;

create or replace function public.is_active_user()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active'); $$;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select exists (select 1 from public.conversation_participants p where p.conversation_id=target_conversation_id and p.user_id=(select auth.uid()) and p.left_at is null); $$;
revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

create or replace function public.is_blocked_between(user_a uuid, user_b uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) in (user_a, user_b) and exists (
    select 1 from public.message_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.provision_profile()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare default_role smallint;
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  select id into default_role from public.roles where name = 'user';
  insert into public.user_roles(user_id, role_id) values (new.id, default_role) on conflict do nothing;
  return new;
end $$;
revoke all on function public.provision_profile() from public, anon, authenticated;
create trigger auth_user_profile_created after insert on auth.users
  for each row execute function public.provision_profile();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;
insert into public.user_roles(user_id, role_id)
select p.id, r.id from public.profiles p cross join public.roles r
where r.name='user' and not exists (select 1 from public.user_roles ur where ur.user_id=p.id)
on conflict do nothing;

create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare current_user_id uuid := auth.uid(); low_id uuid; high_id uuid; result_id uuid;
begin
  if current_user_id is null or not public.is_active_user() then raise exception 'authentication required' using errcode = '42501'; end if;
  if target_user_id is null or target_user_id = current_user_id then raise exception 'invalid conversation participant' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.account_status = 'active') then raise exception 'recipient unavailable' using errcode = '22023'; end if;
  if public.is_blocked_between(current_user_id, target_user_id) then raise exception 'conversation unavailable' using errcode = '42501'; end if;
  low_id := least(current_user_id, target_user_id); high_id := greatest(current_user_id, target_user_id);
  insert into public.conversations(conversation_type, direct_user_low, direct_user_high, created_by)
    values ('direct', low_id, high_id, current_user_id)
    on conflict (direct_user_low, direct_user_high) where conversation_type = 'direct'
    do update set updated_at = now()
    returning id into result_id;
  insert into public.conversation_participants(conversation_id, user_id)
    values (result_id, low_id), (result_id, high_id)
    on conflict (conversation_id, user_id) do update set left_at = null;
  return result_id;
end $$;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.notifications(recipient_id, notification_type, title, message, message_id, action_url, deduplication_key)
  select p.user_id, 'private_message', 'New message', 'You received a private message.', new.id,
    '/messages/' || new.conversation_id::text, 'message:' || new.id::text || ':' || p.user_id::text
  from public.conversation_participants p
  join public.profiles pr on pr.id=p.user_id and pr.account_status='active'
  left join public.notification_preferences np on np.user_id=p.user_id and np.notification_type='private_message'
  where p.conversation_id=new.conversation_id and p.user_id<>new.sender_id and p.left_at is null and coalesce(np.in_app_enabled,true)
  on conflict (recipient_id, deduplication_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_new_message() from public, anon, authenticated;
create trigger message_notification_created after insert on public.messages for each row execute function public.notify_new_message();

create or replace function public.notify_published_content()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare kind text; event_key text; message_text text;
begin
  if new.status <> 'published' or new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then return new; end if;
  end if;
  kind := case new.content_type when 'movie' then 'new_movie' else 'new_series' end;
  message_text := case new.content_type when 'movie' then 'A new movie is available.' else 'A new series is available.' end;
  event_key := 'content:' || new.id::text || ':published';
  insert into public.notifications(recipient_id, notification_type, title, message, content_item_id, action_url, deduplication_key)
  select p.id, kind, new.title, message_text, new.id, '/details/' || new.slug, event_key
  from public.profiles p left join public.notification_preferences np on np.user_id=p.id and np.notification_type=kind
  where p.account_status='active' and coalesce(np.in_app_enabled,true)
  on conflict (recipient_id, deduplication_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_published_content() from public, anon, authenticated;
create trigger content_publication_notification after insert or update of status, published_at on public.content_items
  for each row execute function public.notify_published_content();

create or replace function public.notify_published_episode()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare parent_content public.content_items%rowtype; season_row public.seasons%rowtype; event_key text;
begin
  if new.status <> 'published' or new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then return new; end if;
  end if;
  select * into season_row from public.seasons where id=new.season_id;
  select c.* into parent_content from public.content_items c where c.id=season_row.series_id and c.status='published';
  if not found then return new; end if;
  event_key := 'episode:' || new.id::text || ':published';
  insert into public.notifications(recipient_id, notification_type, title, message, content_item_id, episode_id, action_url, deduplication_key)
  select f.user_id, 'new_episode', parent_content.title || ' — ' || new.title, 'A new episode is available.', parent_content.id, new.id,
    '/details/' || parent_content.slug, event_key
  from public.favorites f left join public.notification_preferences np on np.user_id=f.user_id and np.notification_type='new_episode'
  where f.content_id=parent_content.id and coalesce(np.in_app_enabled,true)
  on conflict (recipient_id, deduplication_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_published_episode() from public, anon, authenticated;
create trigger episode_publication_notification after insert or update of status, published_at on public.episodes
  for each row execute function public.notify_published_episode();

create or replace function public.notify_published_announcement()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.status <> 'published' or new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then return new; end if;
  end if;
  insert into public.notifications(recipient_id, notification_type, title, message, announcement_id, action_url, deduplication_key)
  select p.id, 'announcement', new.title, new.body, new.id, '/announcements/' || new.id::text, 'announcement:' || new.id::text
  from public.profiles p left join public.notification_preferences np on np.user_id=p.id and np.notification_type='announcement'
  where p.account_status='active' and coalesce(np.in_app_enabled,true)
  on conflict (recipient_id, deduplication_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_published_announcement() from public, anon, authenticated;
create trigger announcement_notification after insert or update of status, published_at on public.announcements
  for each row execute function public.notify_published_announcement();

create or replace function public.assert_direct_participants()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare convo_id uuid; convo public.conversations%rowtype; participant_count integer; low_present boolean; high_present boolean;
begin
  convo_id := case when tg_table_name = 'conversations' then case when tg_op = 'DELETE' then old.id else new.id end
                   else case when tg_op = 'DELETE' then old.conversation_id else new.conversation_id end end;
  select * into convo from public.conversations where id = convo_id;
  if not found or convo.conversation_type <> 'direct' then return null; end if;
  select count(*) filter (where left_at is null),
         bool_or(user_id = convo.direct_user_low and left_at is null),
         bool_or(user_id = convo.direct_user_high and left_at is null)
    into participant_count, low_present, high_present
    from public.conversation_participants where conversation_id = convo_id;
  if participant_count <> 2 or not coalesce(low_present, false) or not coalesce(high_present, false) then
    raise exception 'direct conversations require exactly their two designated active participants' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger direct_conversation_membership_check after insert or update or delete on public.conversation_participants
  deferrable initially deferred for each row execute function public.assert_direct_participants();
create constraint trigger direct_conversation_creation_check after insert or update on public.conversations
  deferrable initially deferred for each row execute function public.assert_direct_participants();

create or replace function public.get_reported_message_for_moderation(target_message_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb; message_conversation uuid;
begin
  if not public.has_permission('messages.moderate') then raise exception 'permission denied' using errcode = '42501'; end if;
  select m.conversation_id into message_conversation
    from public.messages m join public.message_reports mr on mr.message_id = m.id
    where m.id = target_message_id and mr.status in ('open', 'reviewing') limit 1;
  if message_conversation is null then raise exception 'reported message not found' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'message.moderation_read', 'message', target_message_id);
  select jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'sender_id', m.sender_id,
    'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at, 'deleted_at', m.deleted_at,
    'moderation_status', m.moderation_status) into result from public.messages m where m.id = target_message_id;
  return result;
end $$;
revoke all on function public.get_reported_message_for_moderation(uuid) from public, anon;
grant execute on function public.get_reported_message_for_moderation(uuid) to authenticated;

create or replace function public.moderate_content(target_kind text, target_id uuid, next_status text, action_reason text default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare needed_permission text; changed integer; moderator uuid := auth.uid();
begin
  needed_permission := case target_kind when 'review' then 'comments.moderate' when 'comment' then 'comments.moderate'
    when 'report' then 'reports.review' when 'message_report' then 'reports.review' when 'message' then 'messages.moderate' else null end;
  if needed_permission is null or not public.has_permission(needed_permission) then raise exception 'permission denied' using errcode='42501'; end if;
  if target_kind in ('review','comment') and next_status not in ('pending','published','hidden','removed') then raise exception 'invalid status' using errcode='22023'; end if;
  if target_kind in ('report','message_report') and next_status not in ('open','reviewing','resolved','dismissed') then raise exception 'invalid status' using errcode='22023'; end if;
  if target_kind='message' and next_status not in ('visible','hidden','removed') then raise exception 'invalid status' using errcode='22023'; end if;
  if target_kind='review' then update public.reviews set status=next_status, updated_at=now() where id=target_id;
  elsif target_kind='comment' then update public.comments set status=next_status, updated_at=now() where id=target_id;
  elsif target_kind='report' then update public.reports set status=next_status, assigned_to=moderator, updated_at=now(), resolved_at=case when next_status in ('resolved','dismissed') then now() else null end where id=target_id;
  elsif target_kind='message_report' then update public.message_reports set status=next_status, assigned_to=moderator, updated_at=now(), resolved_at=case when next_status in ('resolved','dismissed') then now() else null end where id=target_id;
  else update public.messages set moderation_status=next_status where id=target_id and exists (select 1 from public.message_reports mr where mr.message_id=target_id and mr.status in ('open','reviewing'));
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'moderation target not found or not reportable' using errcode='P0002'; end if;
  insert into public.moderation_actions(moderator_id, review_id, comment_id, message_id, report_id, message_report_id, action, reason)
  values (moderator, case when target_kind='review' then target_id end, case when target_kind='comment' then target_id end,
    case when target_kind='message' then target_id end, case when target_kind='report' then target_id end,
    case when target_kind='message_report' then target_id end, next_status, action_reason);
end $$;
revoke all on function public.moderate_content(text, uuid, text, text) from public, anon;
grant execute on function public.moderate_content(text, uuid, text, text) to authenticated;

create or replace function public.set_user_role(target_user uuid, role_name text, should_have_role boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare target_role smallint; admin_role smallint; remaining_admins integer;
begin
  if not public.has_permission('users.manage') then raise exception 'permission denied' using errcode='42501'; end if;
  if target_user is null or role_name not in ('user','moderator','administrator') then raise exception 'invalid role assignment' using errcode='22023'; end if;
  select id into target_role from public.roles where name=role_name;
  if should_have_role then
    insert into public.user_roles(user_id, role_id, granted_by) values (target_user,target_role,auth.uid()) on conflict do nothing;
  else
    if role_name='administrator' then
      select id into admin_role from public.roles where name='administrator';
      select count(*) into remaining_admins from public.user_roles ur join public.profiles p on p.id=ur.user_id
        where ur.role_id=admin_role and ur.user_id<>target_user and p.account_status='active';
      if remaining_admins < 1 then raise exception 'cannot remove the final administrator' using errcode='23514'; end if;
    end if;
    delete from public.user_roles where user_id=target_user and role_id=target_role;
  end if;
end $$;
revoke all on function public.set_user_role(uuid, text, boolean) from public, anon;
grant execute on function public.set_user_role(uuid, text, boolean) to authenticated;

create or replace function public.set_role_permission(role_name text, permission_name text, should_have_permission boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_role smallint; target_permission smallint;
begin
  if not public.has_permission('users.manage') then raise exception 'permission denied' using errcode='42501'; end if;
  select id into target_role from public.roles where name=role_name;
  select id into target_permission from public.permissions where name=permission_name;
  if target_role is null or target_permission is null then raise exception 'role or permission not found' using errcode='P0002'; end if;
  if should_have_permission then insert into public.role_permissions(role_id,permission_id) values (target_role,target_permission) on conflict do nothing;
  else delete from public.role_permissions where role_id=target_role and permission_id=target_permission; end if;
end $$;
revoke all on function public.set_role_permission(text, text, boolean) from public, anon;
grant execute on function public.set_role_permission(text, text, boolean) to authenticated;

create or replace function public.set_account_status(target_user uuid, next_status text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare admins_remaining integer;
begin
  if not public.has_permission('users.manage') then raise exception 'permission denied' using errcode='42501'; end if;
  if next_status not in ('active','suspended','closed') then raise exception 'invalid status' using errcode='22023'; end if;
  if next_status <> 'active' and exists (select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=target_user and r.name='administrator') then
    select count(*) into admins_remaining from public.user_roles ur join public.roles r on r.id=ur.role_id join public.profiles p on p.id=ur.user_id where r.name='administrator' and p.account_status='active' and ur.user_id<>target_user;
    if admins_remaining < 1 then raise exception 'cannot deactivate the final active administrator' using errcode='23514'; end if;
  end if;
  update public.profiles set account_status=next_status, updated_at=now() where id=target_user;
  if not found then raise exception 'profile not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.set_account_status(uuid, text) from public, anon;
grant execute on function public.set_account_status(uuid, text) to authenticated;

create or replace function public.write_admin_audit()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare prior_row jsonb; next_row jsonb; row_id uuid; operation_name text;
begin
  if tg_op <> 'INSERT' then prior_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then next_row := to_jsonb(new); end if;
  if tg_table_name = 'media_sources' then
    prior_row := prior_row - 'external_reference';
    next_row := next_row - 'external_reference';
  end if;
  row_id := coalesce((next_row->>'id')::uuid, (next_row->>'content_id')::uuid,
                     (next_row->>'user_id')::uuid, (prior_row->>'id')::uuid,
                     (prior_row->>'content_id')::uuid, (prior_row->>'user_id')::uuid);
  operation_name := lower(tg_op);
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (auth.uid(), tg_table_name || '.' || operation_name, tg_table_name, row_id, prior_row, next_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.write_admin_audit() from public, anon, authenticated;
create trigger audit_content_items after insert or update or delete on public.content_items for each row execute function public.write_admin_audit();
create trigger audit_movies after insert or update or delete on public.movies for each row execute function public.write_admin_audit();
create trigger audit_series after insert or update or delete on public.series for each row execute function public.write_admin_audit();
create trigger audit_movie_parts after insert or update or delete on public.movie_parts for each row execute function public.write_admin_audit();
create trigger audit_seasons after insert or update or delete on public.seasons for each row execute function public.write_admin_audit();
create trigger audit_episodes after insert or update or delete on public.episodes for each row execute function public.write_admin_audit();
create trigger audit_media_sources after insert or update or delete on public.media_sources for each row execute function public.write_admin_audit();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.write_admin_audit();
create trigger audit_announcements after insert or update or delete on public.announcements for each row execute function public.write_admin_audit();
create trigger audit_moderation_actions after insert or update or delete on public.moderation_actions for each row execute function public.write_admin_audit();
create trigger audit_reports after insert or update or delete on public.reports for each row execute function public.write_admin_audit();
create trigger audit_message_reports after insert or update or delete on public.message_reports for each row execute function public.write_admin_audit();
create trigger audit_profiles after update on public.profiles for each row execute function public.write_admin_audit();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function public.write_admin_audit();
create trigger audit_media_assets after insert or update or delete on public.media_assets for each row execute function public.write_admin_audit();
create trigger audit_external_links after insert or update or delete on public.external_links for each row execute function public.write_admin_audit();
create trigger audit_genres after insert or update or delete on public.genres for each row execute function public.write_admin_audit();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.write_admin_audit();

-- Revoke default table access, then grant only operations supported by the policies below.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.content_items, public.movies, public.series, public.movie_parts, public.seasons, public.episodes,
  public.categories, public.genres, public.movie_genres, public.series_genres, public.media_assets, public.media_sources, public.external_links to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, profile_picture_asset_id, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences, public.favorites, public.watchlists, public.watchlist_items,
  public.watch_history, public.user_ratings, public.message_blocks to authenticated;
grant select, insert, delete on public.reviews, public.comments to authenticated;
grant update (title, body, updated_at, deleted_at) on public.reviews to authenticated;
grant update (body, updated_at, deleted_at) on public.comments to authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.reports, public.message_reports to authenticated;
grant select on public.conversations, public.conversation_participants, public.messages, public.message_attachments,
  public.message_read_receipts to authenticated;
grant insert, update (body, edited_at, deleted_at) on public.messages to authenticated;
grant insert on public.message_attachments, public.message_read_receipts to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.announcements to anon, authenticated;
grant select on public.moderation_actions, public.admin_audit_log to authenticated;
grant insert, update, delete on public.content_items, public.movies, public.series, public.movie_parts, public.seasons, public.episodes,
  public.categories, public.genres, public.movie_genres, public.series_genres, public.media_assets, public.media_sources, public.external_links to authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'content_items','movies','series','movie_parts','seasons','episodes','categories','genres','movie_genres','series_genres',
    'media_assets','media_sources','external_links','profiles','user_preferences','roles','permissions','user_roles','role_permissions',
    'favorites','watchlists','watchlist_items','watch_history','user_ratings','reviews','comments','reports','conversations',
    'conversation_participants','messages','message_attachments','message_read_receipts','message_blocks','message_reports',
    'announcements','notification_preferences','notifications','moderation_actions','admin_audit_log'
  ] loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy published_content_read on public.content_items for select to anon, authenticated using (status = 'published' or public.has_permission('content.manage'));
create policy content_admin_write on public.content_items for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy movie_subtype_read on public.movies for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = content_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy movie_subtype_admin on public.movies for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy series_subtype_read on public.series for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = content_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy series_subtype_admin on public.series for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy parts_public_read on public.movie_parts for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = movie_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy parts_admin_write on public.movie_parts for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy seasons_public_read on public.seasons for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = series_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy seasons_admin_write on public.seasons for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy episodes_public_read on public.episodes for select to anon, authenticated using ((status='published' and exists (select 1 from public.seasons s join public.content_items c on c.id = s.series_id where s.id = season_id and c.status='published')) or public.has_permission('content.manage'));
create policy episodes_admin_write on public.episodes for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
create policy categories_admin_write on public.categories for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy genres_public_read on public.genres for select to anon, authenticated using (true);
create policy genres_admin_write on public.genres for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy movie_genres_public_read on public.movie_genres for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = movie_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy movie_genres_admin_write on public.movie_genres for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy series_genres_public_read on public.series_genres for select to anon, authenticated using (exists (select 1 from public.content_items c where c.id = series_id and (c.status = 'published' or public.has_permission('content.manage'))));
create policy series_genres_admin_write on public.series_genres for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy public_content_artwork_read on public.media_assets for select to anon, authenticated using (
  (asset_type in ('poster','banner','thumbnail','narrator_image') and (
    exists (select 1 from public.content_items c where c.status = 'published' and media_assets.id in (c.poster_asset_id,c.banner_asset_id,c.narrator_image_asset_id)) or
    exists (select 1 from public.episodes e join public.seasons s on s.id=e.season_id join public.content_items c on c.id=s.series_id where c.status='published' and e.thumbnail_asset_id=media_assets.id)
  )) or (created_by = (select auth.uid())) or public.has_permission('content.manage'));
create policy message_attachment_asset_participant_read on public.media_assets for select to authenticated using (
  exists (select 1 from public.message_attachments ma join public.messages m on m.id=ma.message_id
    where ma.media_asset_id=media_assets.id and public.is_conversation_participant(m.conversation_id)));
create policy media_asset_admin_insert on public.media_assets for insert to authenticated with check (
  public.has_permission('content.manage') or (created_by = (select auth.uid()) and
    ((asset_type='profile_picture' and bucket='profile-images' and split_part(object_key,'/',1)=(select auth.uid())::text) or
     (asset_type='message_attachment' and bucket='private-message-attachments' and split_part(object_key,'/',2)=(select auth.uid())::text))));
create policy media_asset_admin_update on public.media_assets for update to authenticated
  using (public.has_permission('content.manage') or created_by = (select auth.uid()))
  with check (public.has_permission('content.manage') or (created_by = (select auth.uid()) and
    ((asset_type='profile_picture' and bucket='profile-images' and split_part(object_key,'/',1)=(select auth.uid())::text) or
     (asset_type='message_attachment' and bucket='private-message-attachments' and split_part(object_key,'/',2)=(select auth.uid())::text))));
create policy media_asset_admin_delete on public.media_assets for delete to authenticated using (public.has_permission('content.manage'));
create policy approved_sources_read on public.media_sources for select to anon, authenticated using (
  (is_active and is_public and ((movie_part_id is not null and exists (select 1 from public.movie_parts p join public.content_items c on c.id=p.movie_id where p.id=movie_part_id and c.status='published')) or
    (episode_id is not null and exists (select 1 from public.episodes e join public.seasons s on s.id=e.season_id join public.content_items c on c.id=s.series_id where e.id=episode_id and c.status='published')))) or public.has_permission('content.manage'));
create policy sources_admin_write on public.media_sources for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy external_links_public_read on public.external_links for select to anon, authenticated using (is_active and exists (select 1 from public.content_items c where c.id=content_id and c.status='published') or public.has_permission('content.manage'));
create policy external_links_admin_write on public.external_links for all to authenticated using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));

create policy profiles_owner_read on public.profiles for select to authenticated using (id=(select auth.uid()) or public.has_permission('users.manage'));
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id=(select auth.uid()) and public.is_active_user())
  with check (id=(select auth.uid()) and (profile_picture_asset_id is null or exists (
    select 1 from public.media_assets a where a.id=profile_picture_asset_id and a.created_by=(select auth.uid()) and a.asset_type='profile_picture')));
create policy profiles_admin_update on public.profiles for update to authenticated using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));
create policy preferences_owner_all on public.user_preferences for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy roles_admin_read on public.roles for select to authenticated using (public.has_permission('users.manage'));
create policy permissions_admin_read on public.permissions for select to authenticated using (public.has_permission('users.manage'));
create policy user_roles_owner_or_admin_read on public.user_roles for select to authenticated using (user_id=(select auth.uid()) or public.has_permission('users.manage'));
create policy user_roles_admin_manage on public.user_roles for all to authenticated using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));
create policy role_permissions_admin_read on public.role_permissions for select to authenticated using (public.has_permission('users.manage'));
create policy role_permissions_admin_manage on public.role_permissions for all to authenticated using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));

create policy favorites_owner_all on public.favorites for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy watchlists_owner_all on public.watchlists for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy watchlist_items_owner_all on public.watchlist_items for all to authenticated using (exists (select 1 from public.watchlists w where w.id=watchlist_id and w.user_id=(select auth.uid()))) with check (exists (select 1 from public.watchlists w where w.id=watchlist_id and w.user_id=(select auth.uid())));
create policy watch_history_owner_all on public.watch_history for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy ratings_owner_all on public.user_ratings for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy reviews_read_published_or_owner on public.reviews for select to anon, authenticated using ((status='published' and deleted_at is null) or user_id=(select auth.uid()) or public.has_permission('comments.moderate'));
create policy reviews_owner_insert on public.reviews for insert to authenticated with check (user_id=(select auth.uid()) and public.is_active_user());
create policy reviews_owner_update on public.reviews for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy reviews_moderator_update on public.reviews for update to authenticated using (public.has_permission('comments.moderate')) with check (public.has_permission('comments.moderate'));
create policy reviews_owner_delete on public.reviews for delete to authenticated using (user_id=(select auth.uid()));
create policy comments_read_published_or_owner on public.comments for select to anon, authenticated using ((status='published' and deleted_at is null) or user_id=(select auth.uid()) or public.has_permission('comments.moderate'));
create policy comments_owner_insert on public.comments for insert to authenticated with check (user_id=(select auth.uid()) and public.is_active_user());
create policy comments_owner_update on public.comments for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy comments_moderator_update on public.comments for update to authenticated using (public.has_permission('comments.moderate')) with check (public.has_permission('comments.moderate'));
create policy comments_owner_delete on public.comments for delete to authenticated using (user_id=(select auth.uid()));
create policy reports_owner_read on public.reports for select to authenticated using (reporter_id=(select auth.uid()) or public.has_permission('reports.review'));
create policy reports_owner_insert on public.reports for insert to authenticated with check (reporter_id=(select auth.uid()) and public.is_active_user());
create policy reports_moderator_update on public.reports for update to authenticated using (public.has_permission('reports.review')) with check (public.has_permission('reports.review'));

create policy conversations_participant_read on public.conversations for select to authenticated using (public.is_conversation_participant(id));
create policy participants_member_read on public.conversation_participants for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy messages_participant_read on public.messages for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy messages_active_sender_insert on public.messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and public.is_active_user() and
  public.is_conversation_participant(conversation_id) and
  not exists (select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id<>(select auth.uid()) and public.is_blocked_between((select auth.uid()), p.user_id))
);
create policy messages_sender_update on public.messages for update to authenticated using (
  sender_id=(select auth.uid()) and exists (select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=(select auth.uid()) and p.left_at is null)
) with check (sender_id=(select auth.uid()));
create policy attachments_participant_read on public.message_attachments for select to authenticated using (exists (select 1 from public.messages m where m.id=message_id and public.is_conversation_participant(m.conversation_id)));
create policy attachments_sender_insert on public.message_attachments for insert to authenticated with check (
  exists (select 1 from public.messages m where m.id=message_id and m.sender_id=(select auth.uid()) and m.deleted_at is null) and
  exists (select 1 from public.media_assets a join public.messages m on m.id=message_id
    where a.id=media_asset_id and a.created_by=(select auth.uid()) and a.asset_type='message_attachment'
      and a.bucket='private-message-attachments' and split_part(a.object_key,'/',1)=m.conversation_id::text
      and split_part(a.object_key,'/',2)=(select auth.uid())::text));
create policy read_receipt_member_read on public.message_read_receipts for select to authenticated using (exists (select 1 from public.messages m where m.id=message_id and public.is_conversation_participant(m.conversation_id)));
create policy read_receipt_self_insert on public.message_read_receipts for insert to authenticated with check (user_id=(select auth.uid()) and exists (select 1 from public.messages m where m.id=message_id and public.is_conversation_participant(m.conversation_id)));
create policy message_blocks_involved_read on public.message_blocks for select to authenticated using (blocker_id=(select auth.uid()) or blocked_id=(select auth.uid()));
create policy message_blocks_owner_all on public.message_blocks for all to authenticated using (blocker_id=(select auth.uid())) with check (blocker_id=(select auth.uid()) and public.is_active_user());
create policy message_reports_participant_read on public.message_reports for select to authenticated using (reporter_id=(select auth.uid()) or public.has_permission('reports.review'));
create policy message_reports_participant_insert on public.message_reports for insert to authenticated with check (reporter_id=(select auth.uid()) and exists (select 1 from public.messages m where m.id=message_id and public.is_conversation_participant(m.conversation_id)));
create policy message_reports_moderator_update on public.message_reports for update to authenticated using (public.has_permission('reports.review')) with check (public.has_permission('reports.review'));

create policy announcements_published_read on public.announcements for select to anon, authenticated using (status='published' or public.has_permission('announcements.manage'));
create policy announcements_admin_write on public.announcements for all to authenticated using (public.has_permission('announcements.manage')) with check (public.has_permission('announcements.manage'));
create policy notification_preferences_owner_all on public.notification_preferences for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy notifications_owner_read on public.notifications for select to authenticated using (recipient_id=(select auth.uid()));
create policy notifications_owner_mark_read on public.notifications for update to authenticated using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
create policy moderation_actions_moderator_read on public.moderation_actions for select to authenticated using (public.has_permission('reports.review') or public.has_permission('comments.moderate') or public.has_permission('messages.moderate'));
create policy admin_audit_admin_read on public.admin_audit_log for select to authenticated using (public.has_permission('audit.read'));

-- Message moderation is exceptional and report-scoped; direct moderator table SELECT is intentionally absent.
-- Storage object names: profile-images/<auth.uid()>/<file>; private-message-attachments/<conversation_uuid>/<file>.
create policy public_artwork_read on storage.objects for select to anon, authenticated using (bucket_id='public-artwork');
create policy public_artwork_admin_insert on storage.objects for insert to authenticated with check (bucket_id='public-artwork' and public.has_permission('content.manage'));
create policy public_artwork_admin_update on storage.objects for update to authenticated using (bucket_id='public-artwork' and public.has_permission('content.manage')) with check (bucket_id='public-artwork' and public.has_permission('content.manage'));
create policy public_artwork_admin_delete on storage.objects for delete to authenticated using (bucket_id='public-artwork' and public.has_permission('content.manage'));
create policy profile_image_owner_read on storage.objects for select to authenticated using (bucket_id='profile-images' and split_part(name,'/',1)=(select auth.uid())::text);
create policy profile_image_owner_insert on storage.objects for insert to authenticated with check (bucket_id='profile-images' and split_part(name,'/',1)=(select auth.uid())::text);
create policy profile_image_owner_update on storage.objects for update to authenticated using (bucket_id='profile-images' and split_part(name,'/',1)=(select auth.uid())::text) with check (bucket_id='profile-images' and split_part(name,'/',1)=(select auth.uid())::text);
create policy profile_image_owner_delete on storage.objects for delete to authenticated using (bucket_id='profile-images' and split_part(name,'/',1)=(select auth.uid())::text);
create policy message_attachment_participant_read on storage.objects for select to authenticated using (
  bucket_id='private-message-attachments' and exists (
    select 1 from public.conversation_participants p where p.conversation_id::text=split_part(name,'/',1) and p.user_id=(select auth.uid()) and p.left_at is null
  ));
create policy message_attachment_participant_insert on storage.objects for insert to authenticated with check (
  bucket_id='private-message-attachments' and split_part(name,'/',2)=(select auth.uid())::text and exists (
    select 1 from public.conversation_participants p where p.conversation_id::text=split_part(name,'/',1) and p.user_id=(select auth.uid()) and p.left_at is null
  ));
create policy message_attachment_owner_delete on storage.objects for delete to authenticated using (
  bucket_id='private-message-attachments' and split_part(name,'/',2)=(select auth.uid())::text and exists (
    select 1 from public.messages m join public.conversation_participants p on p.conversation_id=m.conversation_id
    where m.conversation_id::text=split_part(name,'/',1) and m.sender_id=(select auth.uid()) and p.user_id=(select auth.uid()) and p.left_at is null
  ));
