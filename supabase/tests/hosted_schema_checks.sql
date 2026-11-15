-- CINEVA hosted schema inspection. Read-only metadata queries for Supabase SQL Editor.
-- Run while connected to the intended CINEVA-Development project as a role that can
-- inspect catalogs. This script does not change data or database configuration.
with
expected_tables(schema_name, table_name) as (values
  ('public','content_items'),('public','categories'),('public','genres'),('public','movies'),('public','series'),
  ('public','movie_parts'),('public','seasons'),('public','episodes'),('public','movie_genres'),('public','series_genres'),
  ('public','media_assets'),('public','media_sources'),('public','external_links'),('public','profiles'),('public','user_preferences'),
  ('public','roles'),('public','permissions'),('public','user_roles'),('public','role_permissions'),('public','favorites'),
  ('public','watchlists'),('public','watchlist_items'),('public','watch_history'),('public','user_ratings'),('public','reviews'),
  ('public','comments'),('public','reports'),('public','conversations'),('public','conversation_participants'),('public','messages'),
  ('public','message_attachments'),('public','message_read_receipts'),('public','message_blocks'),('public','message_reports'),
  ('public','announcements'),('public','notification_preferences'),('public','notifications'),('public','moderation_actions'),
  ('public','admin_audit_log')
),
expected_constraints(table_name, constraint_name) as (values
  ('content_items','content_items_pkey'),('content_items','content_items_content_type_legacy_id_key'),('content_items','content_items_content_type_slug_key'),
  ('content_items','content_narrator_asset_fk'),('content_items','content_poster_asset_fk'),('content_items','content_banner_asset_fk'),
  ('movies','movies_pkey'),('movies','movies_content_id_fkey'),('series','series_pkey'),('series','series_content_id_fkey'),
  ('movie_parts','movie_parts_pkey'),('movie_parts','movie_parts_movie_id_fkey'),('movie_parts','movie_parts_movie_id_part_number_key'),
  ('seasons','seasons_pkey'),('seasons','seasons_series_id_season_number_key'),('episodes','episodes_pkey'),('episodes','episodes_season_id_fkey'),
  ('episodes','episodes_season_id_episode_number_key'),('episodes','episode_thumbnail_asset_fk'),('media_sources','media_sources_check'),
  ('watch_history','watch_history_check'),('favorites','favorites_pkey'),('watchlist_items','watchlist_items_pkey'),
  ('user_ratings','user_ratings_user_id_content_id_key'),('conversations','conversations_check'),('conversation_participants','conversation_participants_pkey'),
  ('messages','messages_conversation_id_fkey'),('message_attachments','message_attachments_message_id_media_asset_id_key'),
  ('message_read_receipts','message_read_receipts_pkey'),('message_blocks','message_blocks_check'),('moderation_actions','moderation_actions_check')
),
expected_indexes(index_name) as (values
  ('media_sources_part_unique'),('media_sources_episode_unique'),('one_default_watchlist_per_user'),
  ('watch_history_user_part_unique'),('watch_history_user_episode_unique'),('one_direct_conversation_per_pair'),
  ('conversation_participants_user_idx'),('messages_conversation_created_idx'),('notifications_unread_idx'),
  ('admin_audit_actor_time_idx'),('admin_audit_entity_idx'),('content_items_public_catalog_idx'),
  ('content_items_title_search_idx'),('movie_parts_movie_idx'),('seasons_series_idx'),('episodes_season_idx'),
  ('movie_genres_genre_idx'),('series_genres_genre_idx'),('media_sources_part_active_idx'),
  ('media_sources_episode_active_idx'),('favorites_content_idx'),('watch_history_user_time_idx'),
  ('reviews_content_status_idx'),('comments_content_status_idx'),('reports_status_created_idx'),
  ('message_reports_status_created_idx')
),
expected_functions(function_name) as (values
  ('touch_catalog_timestamps'),('assert_content_subtype'),('provision_content_subtype'),('has_permission'),
  ('is_active_user'),('is_conversation_participant'),('is_blocked_between'),('provision_profile'),
  ('create_direct_conversation'),('notify_new_message'),('notify_published_content'),('notify_published_episode'),
  ('notify_published_announcement'),('assert_direct_participants'),('get_reported_message_for_moderation'),
  ('moderate_content'),('set_user_role'),('set_role_permission'),('set_account_status'),('write_admin_audit')
),
expected_triggers(trigger_name) as (values
  ('content_items_timestamp'),('episodes_timestamp'),('announcements_timestamp'),('movies_subtype_integrity'),
  ('series_subtype_integrity'),('content_subtype_integrity'),('content_subtype_provision'),('auth_user_profile_created'),
  ('message_notification_created'),('content_publication_notification'),('episode_publication_notification'),
  ('announcement_notification'),('direct_conversation_membership_check'),('direct_conversation_creation_check'),
  ('audit_content_items'),('audit_movies'),('audit_series'),('audit_movie_parts'),('audit_seasons'),('audit_episodes'),
  ('audit_media_sources'),('audit_user_roles'),('audit_announcements'),('audit_moderation_actions'),('audit_reports'),
  ('audit_message_reports'),('audit_profiles'),('audit_role_permissions'),('audit_media_assets'),('audit_external_links'),
  ('audit_genres'),('audit_categories')
),
expected_policies(table_name, policy_name) as (values
 ('conversations','conversations_participant_read'),('conversation_participants','participants_member_read'),
 ('messages','messages_participant_read'),('messages','messages_active_sender_insert'),('messages','messages_sender_update'),
 ('message_attachments','attachments_participant_read'),('message_attachments','attachments_sender_insert'),
 ('message_read_receipts','read_receipt_member_read'),('message_read_receipts','read_receipt_self_insert'),
 ('message_blocks','message_blocks_involved_read'),('message_blocks','message_blocks_owner_all'),
 ('message_reports','message_reports_participant_read'),('message_reports','message_reports_participant_insert'),
 ('message_reports','message_reports_moderator_update'),('media_assets','message_attachment_asset_participant_read'),
 ('media_assets','public_content_artwork_read'),('media_assets','media_asset_admin_insert'),
 ('media_assets','media_asset_admin_update'),('media_assets','media_asset_admin_delete'),
 ('storage.objects','message_attachment_participant_read'),('storage.objects','message_attachment_participant_insert'),
 ('storage.objects','message_attachment_owner_delete'),('storage.objects','profile_image_owner_read'),
 ('storage.objects','profile_image_owner_insert'),('storage.objects','profile_image_owner_update'),
 ('storage.objects','profile_image_owner_delete'),('storage.objects','public_artwork_read'),
 ('storage.objects','public_artwork_admin_insert'),('storage.objects','public_artwork_admin_update'),
 ('storage.objects','public_artwork_admin_delete'),('admin_audit_log','admin_audit_admin_read')
),
checks as (
  select case when count(*)=4 then 'PASS' else 'FAIL' end as status,
    'Expected schemas' as check_name,
    format('found %s of public, auth, storage, extensions schemas',count(*)) as detail
  from pg_namespace where nspname in ('public','auth','storage','extensions')
  union all
  select case when count(*)=39 then 'PASS' else 'FAIL' end as status,
    'Expected application table count' as check_name,
    format('found %s of 39 expected public base tables', count(*)) as detail
  from expected_tables e join pg_namespace n on n.nspname=e.schema_name join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name and c.relkind='r'
  union all
  select 'FAIL' as status,'Missing expected table' as check_name, e.schema_name||'.'||e.table_name as detail
  from expected_tables e where to_regclass(format('%I.%I',e.schema_name,e.table_name)) is null
  union all
  select 'WARNING' as status,'Unexpected public base table' as check_name, n.nspname||'.'||c.relname as detail
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not exists(select 1 from expected_tables e where e.schema_name=n.nspname and e.table_name=c.relname)
  union all
  select 'WARNING' as status,'Unexpected application index' as check_name, n.nspname||'.'||t.relname||'.'||i.relname as detail
  from pg_class i join pg_namespace n on n.oid=i.relnamespace join pg_index x on x.indexrelid=i.oid join pg_class t on t.oid=x.indrelid
  where n.nspname='public' and t.relname in (select table_name from expected_tables)
    and not exists(select 1 from expected_indexes e where e.index_name=i.relname)
    and not exists(select 1 from pg_constraint con where con.conindid=i.oid)
  union all
  select case when bool_and(c.relrowsecurity) then 'PASS' else 'FAIL' end as status,
    'RLS enabled on all expected tables' as check_name,
    format('%s/%s expected tables have RLS enabled', count(*) filter(where c.relrowsecurity), count(*)) as detail
  from expected_tables e join pg_namespace n on n.nspname=e.schema_name join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name and c.relkind='r'
  union all
  select 'FAIL' as status,'Missing expected constraint' as check_name, e.table_name||'.'||e.constraint_name as detail
  from expected_constraints e left join pg_constraint c on c.conrelid=to_regclass('public.'||quote_ident(e.table_name)) and c.conname=e.constraint_name
  where c.oid is null
  union all
  select 'FAIL' as status,'Missing expected index' as check_name, e.index_name as detail
  from expected_indexes e where not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relname=e.index_name and c.relkind='i' and n.nspname='public')
  union all
  select 'FAIL' as status,'Missing expected function' as check_name, e.function_name as detail
  from expected_functions e where not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=e.function_name)
  union all
  select 'WARNING' as status,'Unexpected public function' as check_name, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as detail
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and not exists(select 1 from expected_functions e where e.function_name=p.proname)
  union all
  select 'FAIL' as status,'Missing expected trigger' as check_name, e.trigger_name as detail
  from expected_triggers e where not exists(select 1 from pg_trigger t where not t.tgisinternal and t.tgname=e.trigger_name)
  union all
  select 'FAIL' as status,'Missing expected policy' as check_name, e.table_name||'.'||e.policy_name as detail
  from expected_policies e left join pg_policies p on p.schemaname=case when e.table_name='storage.objects' then 'storage' else 'public' end
      and p.tablename=case when e.table_name='storage.objects' then 'objects' else e.table_name end and p.policyname=e.policy_name
  where p.policyname is null
  union all
  select 'WARNING' as status,'Unexpected messaging/storage policy' as check_name,
    p.schemaname||'.'||p.tablename||'.'||p.policyname||' [command='||p.cmd||'; roles='||array_to_string(p.roles,',')||']' as detail
  from pg_policies p
  where ((p.schemaname='storage' and p.tablename='objects')
     or (p.schemaname='public' and p.tablename in ('conversations','conversation_participants','messages',
         'message_attachments','message_read_receipts','message_blocks','message_reports','media_assets')))
    and not exists(select 1 from expected_policies e where e.table_name=case when p.schemaname='storage' then 'storage.objects' else p.tablename end and e.policy_name=p.policyname)
  union all
  select case when count(*)=3 then 'PASS' else 'FAIL' end as status, 'Expected storage buckets' as check_name,
    format('found %s of 3 expected buckets: %s',count(*),coalesce(string_agg(id,', ' order by id),'none')) as detail
  from storage.buckets where id in ('public-artwork','profile-images','private-message-attachments')
  union all
  select 'FAIL' as status,'Missing storage bucket' as check_name, wanted.id as detail
  from (values ('public-artwork'),('profile-images'),('private-message-attachments')) wanted(id)
  where not exists(select 1 from storage.buckets b where b.id=wanted.id)
  union all
  select 'PASS' as status,'Catalog visibility' as check_name,
    'Expected public and messaging relations were included in object checks; inspect full policy listing below' as detail
)
select status, check_name, detail from checks
union all
select 'INFO','Existing constraint', n.nspname||'.'||t.relname||'.'||c.conname||' ['||case c.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY' when 'u' then 'UNIQUE' when 'c' then 'CHECK' else c.contype::text end||']'
from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public'
union all
select 'INFO','Existing policy', schemaname||'.'||tablename||'.'||policyname||' [command='||cmd||'; roles='||array_to_string(roles,',')||']'
from pg_policies where schemaname in ('public','storage')
union all
select 'INFO','Existing function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
union all
select 'INFO','Existing trigger', n.nspname||'.'||c.relname||'.'||t.tgname
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','auth','storage')
order by 1,2,3;
