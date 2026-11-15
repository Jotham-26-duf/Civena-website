-- Return only the caller's aggregate unread total; no message or conversation data leaves this function.
create or replace function public.get_unread_message_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select count(*)::integer
  from public.messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id
   and p.user_id = (select auth.uid())
   and p.left_at is null
  where public.is_active_user()
    and m.sender_id <> (select auth.uid())
    and m.deleted_at is null
    and m.moderation_status = 'visible'
    and not exists (
      select 1
      from public.message_read_receipts r
      where r.message_id = m.id
        and r.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_unread_message_count() from public, anon;
grant execute on function public.get_unread_message_count() to authenticated;
