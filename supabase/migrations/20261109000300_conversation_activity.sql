-- Keep conversation ordering aligned with its latest message for participant inboxes.
create or replace function public.touch_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_conversation_activity() from public, anon, authenticated;

create trigger message_updates_conversation_activity
after insert on public.messages
for each row execute function public.touch_conversation_activity();
