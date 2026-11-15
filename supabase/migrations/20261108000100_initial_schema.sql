-- CINEVA initial relational schema. Apply with Supabase CLI only after review.
create extension if not exists pgcrypto with schema extensions;

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('movie', 'series')),
  legacy_id bigint not null,
  slug text not null,
  title text not null,
  description text,
  release_year smallint check (release_year between 1888 and 2200),
  legacy_created_date date,
  language text,
  narrator text,
  narrator_image_asset_id uuid,
  quality text,
  is_featured boolean default false,
  is_new boolean default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  poster_asset_id uuid,
  banner_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, legacy_id),
  unique (content_type, slug)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.movies (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  rating numeric(7,3),
  category_id uuid references public.categories(id) on delete set null,
  views_label text
);

create table public.series (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  views_label text
);

create table public.movie_parts (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(content_id) on delete cascade,
  legacy_id text,
  part_number integer not null check (part_number > 0),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id, part_number),
  unique (movie_id, legacy_id)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(content_id) on delete cascade,
  legacy_id text,
  season_number integer not null check (season_number > 0),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, season_number),
  unique (series_id, legacy_id)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  legacy_id text,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  description text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  quality text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  thumbnail_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, episode_number),
  unique (season_id, legacy_id)
);

create table public.movie_genres (
  movie_id uuid not null references public.movies(content_id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (movie_id, genre_id)
);

create table public.series_genres (
  series_id uuid not null references public.series(content_id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (series_id, genre_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('poster', 'banner', 'thumbnail', 'profile_picture', 'message_attachment', 'narrator_image')),
  provider text not null,
  bucket text,
  object_key text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (provider, bucket, object_key)
);

alter table public.content_items
  add constraint content_narrator_asset_fk foreign key (narrator_image_asset_id) references public.media_assets(id) on delete set null,
  add constraint content_poster_asset_fk foreign key (poster_asset_id) references public.media_assets(id) on delete set null,
  add constraint content_banner_asset_fk foreign key (banner_asset_id) references public.media_assets(id) on delete set null;
alter table public.episodes add constraint episode_thumbnail_asset_fk foreign key (thumbnail_asset_id) references public.media_assets(id) on delete set null;

create table public.media_sources (
  id uuid primary key default gen_random_uuid(),
  movie_part_id uuid references public.movie_parts(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  source_kind text not null check (source_kind in ('trailer', 'playback', 'download')),
  provider text,
  external_reference text not null,
  is_public boolean not null default false,
  language text,
  quality text,
  is_active boolean not null default false,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(movie_part_id, episode_id) = 1)
);
create unique index media_sources_part_unique on public.media_sources(movie_part_id, source_kind, provider, external_reference) where movie_part_id is not null;
create unique index media_sources_episode_unique on public.media_sources(episode_id, source_kind, provider, external_reference) where episode_id is not null;

create table public.external_links (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  link_kind text not null check (link_kind in ('official_site', 'social', 'provider', 'other')),
  label text not null,
  url text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  profile_picture_asset_id uuid references public.media_assets(id) on delete set null,
  account_status text not null default 'active' check (account_status in ('active', 'suspended', 'closed')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.media_assets add constraint media_asset_creator_fk foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.media_sources add constraint media_source_creator_fk foreign key (created_by) references public.profiles(id) on delete set null;

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_language text,
  theme text check (theme is null or theme in ('dark', 'light', 'system')),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id smallint generated by default as identity primary key,
  name text not null unique check (name in ('user', 'moderator', 'administrator')),
  description text,
  created_at timestamptz not null default now()
);
create table public.permissions (
  id smallint generated by default as identity primary key,
  name text not null unique,
  description text
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id smallint not null references public.roles(id) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create table public.role_permissions (
  role_id smallint not null references public.roles(id) on delete cascade,
  permission_id smallint not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create unique index one_default_watchlist_per_user on public.watchlists(user_id) where is_default;
create table public.watchlist_items (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, content_id)
);
create table public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_part_id uuid references public.movie_parts(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  is_completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  check (num_nonnulls(movie_part_id, episode_id) = 1)
);
create unique index watch_history_user_part_unique on public.watch_history(user_id, movie_part_id) where movie_part_id is not null;
create unique index watch_history_user_episode_unique on public.watch_history(user_id, episode_id) where episode_id is not null;
create table public.user_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  title text,
  body text not null check (length(trim(body)) > 0),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, content_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(content_item_id, review_id, comment_id) = 1)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type in ('direct', 'group')),
  direct_user_low uuid references public.profiles(id) on delete cascade,
  direct_user_high uuid references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((conversation_type = 'direct' and direct_user_low is not null and direct_user_high is not null and direct_user_low < direct_user_high)
      or (conversation_type = 'group' and direct_user_low is null and direct_user_high is null))
);
create unique index one_direct_conversation_per_pair on public.conversations(direct_user_low, direct_user_high) where conversation_type = 'direct';
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants(user_id, conversation_id) where left_at is null;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'removed')),
  check (body is null or length(trim(body)) > 0)
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc, id desc);
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (message_id, media_asset_id)
);
create table public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create table public.message_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('new_movie', 'new_series', 'new_episode', 'private_message', 'announcement', 'account')),
  title text not null,
  message text not null,
  content_item_id uuid references public.content_items(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  action_url text,
  deduplication_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, deduplication_key)
);
create index notifications_unread_idx on public.notifications(recipient_id, created_at desc) where read_at is null;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles(id) on delete set null,
  review_id uuid references public.reviews(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  message_report_id uuid references public.message_reports(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(review_id, comment_id, message_id, report_id, message_report_id) = 1)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index admin_audit_actor_time_idx on public.admin_audit_log(actor_id, created_at desc);
create index admin_audit_entity_idx on public.admin_audit_log(entity_type, entity_id);

create index content_items_public_catalog_idx on public.content_items(content_type, published_at desc, id) where status = 'published';
create index content_items_title_search_idx on public.content_items using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
create index movie_parts_movie_idx on public.movie_parts(movie_id, part_number);
create index seasons_series_idx on public.seasons(series_id, season_number);
create index episodes_season_idx on public.episodes(season_id, episode_number);
create index movie_genres_genre_idx on public.movie_genres(genre_id, movie_id);
create index series_genres_genre_idx on public.series_genres(genre_id, series_id);
create index media_sources_part_active_idx on public.media_sources(movie_part_id, source_kind, sort_order) where is_active;
create index media_sources_episode_active_idx on public.media_sources(episode_id, source_kind, sort_order) where is_active;
create index favorites_content_idx on public.favorites(content_id);
create index watch_history_user_time_idx on public.watch_history(user_id, last_watched_at desc);
create index reviews_content_status_idx on public.reviews(content_id, created_at desc) where status = 'published' and deleted_at is null;
create index comments_content_status_idx on public.comments(content_id, created_at) where status = 'published' and deleted_at is null;
create index reports_status_created_idx on public.reports(status, created_at);
create index message_reports_status_created_idx on public.message_reports(status, created_at);

create or replace function public.touch_catalog_timestamps()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
create trigger content_items_timestamp before insert or update on public.content_items
  for each row execute function public.touch_catalog_timestamps();
create trigger episodes_timestamp before insert or update on public.episodes
  for each row execute function public.touch_catalog_timestamps();
create trigger announcements_timestamp before insert or update on public.announcements
  for each row execute function public.touch_catalog_timestamps();

-- Enforce exactly one subtype per content item at transaction commit.
create or replace function public.assert_content_subtype()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare target_id uuid; target_type text; movie_count integer; series_count integer;
begin
  if tg_table_name = 'content_items' then
    target_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_id := case when tg_op = 'DELETE' then old.content_id else new.content_id end;
  end if;
  select content_type into target_type from public.content_items where id = target_id;
  if not found then return null; end if;
  select count(*) into movie_count from public.movies where content_id = target_id;
  select count(*) into series_count from public.series where content_id = target_id;
  if (target_type = 'movie' and (movie_count <> 1 or series_count <> 0))
     or (target_type = 'series' and (series_count <> 1 or movie_count <> 0)) then
    raise exception 'content item % must have exactly one matching subtype', target_id using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger movies_subtype_integrity after insert or update or delete on public.movies
  deferrable initially deferred for each row execute function public.assert_content_subtype();
create constraint trigger series_subtype_integrity after insert or update or delete on public.series
  deferrable initially deferred for each row execute function public.assert_content_subtype();
create constraint trigger content_subtype_integrity after insert or update of content_type on public.content_items
  deferrable initially deferred for each row execute function public.assert_content_subtype();

create or replace function public.provision_content_subtype()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.content_type = 'movie' then
    insert into public.movies(content_id) values (new.id) on conflict (content_id) do nothing;
  else
    insert into public.series(content_id) values (new.id) on conflict (content_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.provision_content_subtype() from public, anon, authenticated;
create trigger content_subtype_provision after insert on public.content_items
  for each row execute function public.provision_content_subtype();

insert into public.roles(name, description) values
  ('user', 'Standard authenticated account'),
  ('moderator', 'Explicitly permissioned moderation account'),
  ('administrator', 'Administrative account with assigned permissions')
on conflict (name) do nothing;
insert into public.permissions(name, description) values
  ('content.manage', 'Create, update, publish, archive catalogue content and media references'),
  ('users.manage', 'Manage account status and roles'),
  ('reports.review', 'Review and resolve user reports'),
  ('comments.moderate', 'Moderate reviews and comments'),
  ('messages.moderate', 'Use audited exceptional message moderation access'),
  ('announcements.manage', 'Create and publish platform announcements'),
  ('audit.read', 'Read administrative audit history')
on conflict (name) do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.name = 'administrator'
on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.name in ('reports.review', 'comments.moderate') where r.name = 'moderator'
on conflict do nothing;

-- Create public artwork and private attachment buckets; files remain in Storage, not PostgreSQL.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('public-artwork', 'public-artwork', true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('profile-images', 'profile-images', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('private-message-attachments', 'private-message-attachments', false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
