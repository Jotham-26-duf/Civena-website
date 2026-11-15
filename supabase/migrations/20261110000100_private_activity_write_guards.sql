-- Restrict personal activity mutations to active users and publicly playable content.
-- Existing private rows remain owner-readable; favorites/history can still be removed
-- by their owner while content is unpublished, subject to active-account status.

drop policy favorites_owner_all on public.favorites;
create policy favorites_owner_read on public.favorites
for select to authenticated
using (user_id = (select auth.uid()));
create policy favorites_active_insert on public.favorites
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists (
    select 1 from public.content_items c
    where c.id = content_id and c.status = 'published'
  )
);
create policy favorites_active_delete on public.favorites
for delete to authenticated
using (user_id = (select auth.uid()) and public.is_active_user());

drop policy watch_history_owner_all on public.watch_history;
create policy watch_history_owner_read on public.watch_history
for select to authenticated
using (user_id = (select auth.uid()));
create policy watch_history_active_insert on public.watch_history
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and (
    (
      movie_part_id is not null
      and exists (
        select 1
        from public.movie_parts mp
        join public.movies m on m.content_id = mp.movie_id
        join public.content_items c on c.id = m.content_id
        where mp.id = movie_part_id and c.status = 'published'
      )
    )
    or
    (
      episode_id is not null
      and exists (
        select 1
        from public.episodes e
        join public.seasons s on s.id = e.season_id
        join public.content_items c on c.id = s.series_id
        where e.id = episode_id
          and e.status = 'published'
          and c.status = 'published'
      )
    )
  )
);
create policy watch_history_active_update on public.watch_history
for update to authenticated
using (user_id = (select auth.uid()) and public.is_active_user())
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and (
    (
      movie_part_id is not null
      and exists (
        select 1
        from public.movie_parts mp
        join public.movies m on m.content_id = mp.movie_id
        join public.content_items c on c.id = m.content_id
        where mp.id = movie_part_id and c.status = 'published'
      )
    )
    or
    (
      episode_id is not null
      and exists (
        select 1
        from public.episodes e
        join public.seasons s on s.id = e.season_id
        join public.content_items c on c.id = s.series_id
        where e.id = episode_id
          and e.status = 'published'
          and c.status = 'published'
      )
    )
  )
);
create policy watch_history_active_delete on public.watch_history
for delete to authenticated
using (user_id = (select auth.uid()) and public.is_active_user());
