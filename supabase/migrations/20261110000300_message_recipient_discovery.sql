-- Let active members find active recipients by display name without enumerating
-- profile rows or exposing email addresses and other private profile fields.
create or replace function public.search_message_recipients(search_term text)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_term text := btrim(search_term);
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if normalized_term is null or char_length(normalized_term) < 2 or char_length(normalized_term) > 80 then
    raise exception 'search term must contain 2 to 80 characters' using errcode = '22023';
  end if;

  return query
  select p.id, p.display_name
  from public.profiles p
  where p.account_status = 'active'
    and p.id <> (select auth.uid())
    and p.display_name is not null
    and strpos(lower(p.display_name), lower(normalized_term)) > 0
    and not public.is_blocked_between((select auth.uid()), p.id)
  order by lower(p.display_name), p.id
  limit 20;
end
$$;

revoke all on function public.search_message_recipients(text) from public, anon;
grant execute on function public.search_message_recipients(text) to authenticated;
