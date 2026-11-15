begin;
select plan(12);

select has_table('public', 'content_items', 'shared content parent exists');
select has_table('public', 'movie_parts', 'movie parts table exists');
select has_table('public', 'seasons', 'seasons table exists');
select has_table('public', 'episodes', 'episodes table exists');
select has_table('public', 'profiles', 'auth profile table exists');
select has_table('public', 'messages', 'private messages table exists');
select has_table('public', 'notifications', 'notifications table exists');
select ok(
  (select count(*) = 39 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  'all 39 application tables have row-level security enabled'
);
select has_index('public', 'content_items', 'content_items_public_catalog_idx', 'catalogue browsing index exists');
select has_index('public', 'movie_parts', 'movie_parts_movie_id_part_number_key', 'movie part uniqueness exists');
select has_index('public', 'seasons', 'seasons_series_id_season_number_key', 'season uniqueness exists');
select has_index('public', 'episodes', 'episodes_season_id_episode_number_key', 'episode uniqueness exists');

select * from finish();
rollback;
