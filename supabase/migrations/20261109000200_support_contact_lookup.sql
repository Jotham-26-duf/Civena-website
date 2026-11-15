-- Gives active authenticated users the ID of an active administrator so they can
-- use the existing, block-aware create_direct_conversation RPC for user-to-admin chat.
create or replace function public.get_support_contact_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare support_user_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select ur.user_id into support_user_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.name = 'administrator'
  join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
  order by p.registered_at, ur.user_id
  limit 1;

  if support_user_id is null then
    raise exception 'support unavailable' using errcode = 'P0002';
  end if;
  return support_user_id;
end;
$$;

revoke all on function public.get_support_contact_id() from public, anon;
grant execute on function public.get_support_contact_id() to authenticated;
