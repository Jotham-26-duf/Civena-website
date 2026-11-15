-- Return only discussion fields already visible under the review/comment read policy,
-- with author display names, without granting users access to other profile columns.
create or replace function public.get_content_discussion(target_content_id uuid)
returns table (
  entry_kind text,
  id uuid,
  user_id uuid,
  author_name text,
  parent_comment_id uuid,
  title text,
  body text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select 'review'::text, r.id, r.user_id, coalesce(p.display_name, 'CINEVA member'), null::uuid,
         r.title, r.body, r.status, r.created_at, r.updated_at, r.deleted_at
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where r.content_id = target_content_id
    and ((r.status = 'published' and r.deleted_at is null)
      or r.user_id = (select auth.uid())
      or public.has_permission('comments.moderate'))
  union all
  select 'comment'::text, c.id, c.user_id, coalesce(p.display_name, 'CINEVA member'), c.parent_comment_id,
         null::text, c.body, c.status, c.created_at, c.updated_at, c.deleted_at
  from public.comments c
  left join public.profiles p on p.id = c.user_id
  where c.content_id = target_content_id
    and ((c.status = 'published' and c.deleted_at is null)
      or c.user_id = (select auth.uid())
      or public.has_permission('comments.moderate'))
  order by created_at desc;
$$;

revoke all on function public.get_content_discussion(uuid) from public;
grant execute on function public.get_content_discussion(uuid) to anon, authenticated;

-- A cascading delete must not remove replies written by other members.
create or replace function public.prevent_cross_owner_comment_cascade()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  -- Application DELETE statements invoke this row trigger at depth 1. A
  -- foreign-key cascade (content/profile/self-reply) invokes it from a nested
  -- RI trigger, so let the database finish those trusted cascades.
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (
    with recursive descendants(id, user_id) as (
      select child.id, child.user_id
      from public.comments child
      where child.parent_comment_id = old.id
      union
      select child.id, child.user_id
      from public.comments child
      join descendants parent on child.parent_comment_id = parent.id
    )
    select 1 from descendants where user_id <> old.user_id
  ) then
    raise exception 'comment has replies from other members' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_cross_owner_comment_cascade() from public, anon, authenticated;
create trigger comments_prevent_cross_owner_cascade
before delete on public.comments
for each row execute function public.prevent_cross_owner_comment_cascade();
